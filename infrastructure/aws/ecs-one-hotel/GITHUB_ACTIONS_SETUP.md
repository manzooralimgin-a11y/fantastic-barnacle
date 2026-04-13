# GitHub Actions -> AWS ECS (OIDC) Setup

This document wires automatic backend deployment so every push to `main` builds a new image, pushes it to ECR, runs migrations, and deploys the three ECS services:

- `mg-api`
- `mg-worker`
- `mg-beat`

The workflow file is:

- `.github/workflows/deploy.yml`

The workflow also supports a manual rollback mode via `workflow_dispatch`.

## 1. Create the IAM OIDC provider in AWS

If it does not already exist:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

## 2. Create the GitHub deploy role

Trust policy:

- `infrastructure/aws/ecs-one-hotel/iam/github-oidc-trust-policy.json`

Permissions policy:

- `infrastructure/aws/ecs-one-hotel/iam/github-actions-ecs-deploy-policy.json`

Commands:

```bash
aws iam create-role \
  --role-name mg-github-actions-deploy-role \
  --assume-role-policy-document file://infrastructure/aws/ecs-one-hotel/iam/github-oidc-trust-policy.json

aws iam put-role-policy \
  --role-name mg-github-actions-deploy-role \
  --policy-name mg-github-actions-ecs-deploy \
  --policy-document file://infrastructure/aws/ecs-one-hotel/iam/github-actions-ecs-deploy-policy.json
```

Replace the placeholders before running:

- `<AWS_ACCOUNT_ID>`
- `<GITHUB_OWNER>`
- `<GITHUB_REPO>`

## 3. Configure GitHub repository or environment variables

Set these GitHub **Variables**:

- `AWS_DEPLOY_ROLE_ARN`
  - example: `arn:aws:iam::123456789012:role/mg-github-actions-deploy-role`
- `ECS_CLUSTER`
  - example: `mg-one-hotel-prod`
- `API_BASE_URL`
  - example: `https://api.hotel.example`

The workflow already hardcodes:

- region: `eu-central-1`
- ECR repository: `mg-backend`
- ECS services:
  - `mg-api`
  - `mg-worker`
  - `mg-beat`

If you want different service or repo names later, update `.github/workflows/deploy.yml`.

## 3a. Protect production deployments with GitHub Environments

The workflow already deploys into:

- `environment: production`

To make that a real approval gate:

1. open GitHub repository settings
2. go to `Environments`
3. create or edit the `production` environment
4. add `Required reviewers`

That gives you the safest setup:

- pushes to `main` prepare a release
- production deploy waits for approval

## 4. Required AWS-side assumptions

The workflow expects:

- an existing ECS cluster
- existing ECS services:
  - `mg-api`
  - `mg-worker`
  - `mg-beat`
- an existing ECR repository named `mg-backend`
- the task definition templates committed in:
  - `infrastructure/aws/ecs-one-hotel/task-definitions/`

The workflow derives subnets, security groups, and `assignPublicIp` from the existing `mg-api` service before it runs the migration task.

## 5. What happens on push to main

1. GitHub assumes the AWS role via OIDC
2. logs into ECR
3. builds the backend Docker image
4. smoke-tests the container locally on the GitHub runner
5. tags the image with:
   - full commit SHA
   - `latest`
6. pushes the image to ECR
7. renders the ECS task definitions with:
   - AWS account ID
   - region
   - ECR repository
   - commit SHA tag
8. registers and runs the one-off migration task
9. updates `mg-api`
10. updates `mg-worker`
11. updates `mg-beat`
12. verifies:
   - `/health`
   - `/api/ready`

## 6. Image tagging strategy

The workflow uses the full Git commit SHA as the immutable image tag and also publishes `latest`:

- `mg-backend:<github.sha>`
- `mg-backend:latest`

This gives:

- deterministic rollbacks
- traceability from ECS task revision to commit
- no ambiguity around `latest`

## 7. Rollback

Rollback is simple:

1. find the previous task definition revision in ECS
2. update each service back to that revision
3. or use the built-in workflow rollback mode by supplying `rollback_task_revision`

Example:

```bash
aws ecs update-service --cluster mg-one-hotel-prod --service mg-api --task-definition mg-backend-api:<old-revision>
aws ecs update-service --cluster mg-one-hotel-prod --service mg-worker --task-definition mg-backend-worker:<old-revision>
aws ecs update-service --cluster mg-one-hotel-prod --service mg-beat --task-definition mg-backend-beat:<old-revision>
```

Manual rollback from GitHub Actions:

1. open `Deploy Backend to AWS ECS`
2. click `Run workflow`
3. choose `action=rollback`
4. enter `rollback_task_revision`

Note:

- the rollback shortcut assumes the three task definition families move forward in lockstep:
  - `mg-backend-api`
  - `mg-backend-worker`
  - `mg-backend-beat`
- if they ever diverge, use ECS directly for service-specific rollback
