# MG Backend on AWS ECS Fargate (One Hotel)

This runbook deploys the existing backend as a single modular monolith on AWS:

- one FastAPI API service
- one Celery worker service
- one Celery beat service
- one one-off migration task
- one RDS PostgreSQL instance
- one ElastiCache Redis instance
- one S3 bucket
- one ALB

## 1. Required AWS resources

Create or identify:

- one VPC with at least two public subnets and two private subnets
- one ECS cluster
- one ECR repository for the backend image
- one RDS PostgreSQL instance
- one ElastiCache Redis replication group or single-node cluster
- one S3 bucket for documents/uploads
- one ALB with one target group for the API
- CloudWatch log groups for API, worker, beat, and migration tasks
- IAM execution role and application task role

Recommended names:

- ECS cluster: `mg-one-hotel-prod`
- ECR repo: `mg-backend`
- ALB: `mg-one-hotel-alb`
- Target group: `mg-backend-api-tg`
- S3 bucket: `mg-one-hotel-prod-assets`

## 2. Bootstrap variables

```bash
export AWS_REGION=eu-central-1
export AWS_ACCOUNT_ID=<your-account-id>
export CLUSTER_NAME=mg-one-hotel-prod
export ECR_REPOSITORY=mg-backend
export IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
export VPC_ID=<vpc-id>
export PUBLIC_SUBNET_1=<public-subnet-1>
export PUBLIC_SUBNET_2=<public-subnet-2>
export PRIVATE_SUBNET_1=<private-subnet-1>
export PRIVATE_SUBNET_2=<private-subnet-2>
export ALB_SECURITY_GROUP_ID=<alb-sg-id>
export APP_SECURITY_GROUP_ID=<ecs-app-sg-id>
export DB_SECURITY_GROUP_ID=<rds-sg-id>
export REDIS_SECURITY_GROUP_ID=<redis-sg-id>
```

## 3. Create ECR

```bash
aws ecr create-repository \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY"
```

## 4. Create CloudWatch log groups

```bash
aws logs create-log-group --region "$AWS_REGION" --log-group-name /ecs/mg-backend-api
aws logs create-log-group --region "$AWS_REGION" --log-group-name /ecs/mg-backend-worker
aws logs create-log-group --region "$AWS_REGION" --log-group-name /ecs/mg-backend-beat
aws logs create-log-group --region "$AWS_REGION" --log-group-name /ecs/mg-backend-migrate
```

## 5. Create S3 bucket

```bash
aws s3api create-bucket \
  --region "$AWS_REGION" \
  --bucket mg-one-hotel-prod-assets \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-bucket-versioning \
  --bucket mg-one-hotel-prod-assets \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket mg-one-hotel-prod-assets \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

aws s3api put-public-access-block \
  --bucket mg-one-hotel-prod-assets \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 6. Security groups

ALB:
- inbound `80` from internet
- inbound `443` from internet
- outbound all

ECS app:
- inbound `8000` from ALB security group
- outbound to RDS `5432`
- outbound to Redis `6379`
- outbound `443` for AWS APIs and external integrations

RDS:
- inbound `5432` from ECS app security group only

Redis:
- inbound `6379` from ECS app security group only

Example rules:

```bash
aws ec2 authorize-security-group-ingress --group-id "$APP_SECURITY_GROUP_ID" --protocol tcp --port 8000 --source-group "$ALB_SECURITY_GROUP_ID"
aws ec2 authorize-security-group-ingress --group-id "$DB_SECURITY_GROUP_ID" --protocol tcp --port 5432 --source-group "$APP_SECURITY_GROUP_ID"
aws ec2 authorize-security-group-ingress --group-id "$REDIS_SECURITY_GROUP_ID" --protocol tcp --port 6379 --source-group "$APP_SECURITY_GROUP_ID"
```

## 7. RDS PostgreSQL

Create a private subnet group first, then the DB:

```bash
aws rds create-db-subnet-group \
  --region "$AWS_REGION" \
  --db-subnet-group-name mg-one-hotel-db-subnets \
  --db-subnet-group-description "MG one-hotel DB subnets" \
  --subnet-ids "$PRIVATE_SUBNET_1" "$PRIVATE_SUBNET_2"

aws rds create-db-instance \
  --region "$AWS_REGION" \
  --db-instance-identifier mg-one-hotel-postgres \
  --engine postgres \
  --engine-version 16.3 \
  --db-instance-class db.t4g.medium \
  --allocated-storage 100 \
  --master-username gestronomy \
  --master-user-password '<strong-password>' \
  --db-name gestronomy \
  --vpc-security-group-ids "$DB_SECURITY_GROUP_ID" \
  --db-subnet-group-name mg-one-hotel-db-subnets \
  --storage-encrypted \
  --no-publicly-accessible \
  --backup-retention-period 7
```

## 8. ElastiCache Redis

```bash
aws elasticache create-cache-subnet-group \
  --region "$AWS_REGION" \
  --cache-subnet-group-name mg-one-hotel-redis-subnets \
  --cache-subnet-group-description "MG one-hotel Redis subnets" \
  --subnet-ids "$PRIVATE_SUBNET_1" "$PRIVATE_SUBNET_2"

aws elasticache create-replication-group \
  --region "$AWS_REGION" \
  --replication-group-id mg-one-hotel-redis \
  --replication-group-description "MG one-hotel Redis" \
  --engine redis \
  --cache-node-type cache.t4g.small \
  --num-cache-clusters 1 \
  --cache-subnet-group-name mg-one-hotel-redis-subnets \
  --security-group-ids "$REDIS_SECURITY_GROUP_ID" \
  --transit-encryption-enabled \
  --at-rest-encryption-enabled \
  --automatic-failover-disabled
```

## 9. ALB and target group

```bash
aws elbv2 create-load-balancer \
  --region "$AWS_REGION" \
  --name mg-one-hotel-alb \
  --subnets "$PUBLIC_SUBNET_1" "$PUBLIC_SUBNET_2" \
  --security-groups "$ALB_SECURITY_GROUP_ID" \
  --scheme internet-facing \
  --type application

aws elbv2 create-target-group \
  --region "$AWS_REGION" \
  --name mg-backend-api-tg \
  --protocol HTTP \
  --port 8000 \
  --target-type ip \
  --vpc-id "$VPC_ID" \
  --health-check-path /api/ready \
  --health-check-protocol HTTP \
  --matcher HttpCode=200
```

Then create listeners for `80` and `443` and forward to the API target group.

## 10. ECS cluster

```bash
aws ecs create-cluster \
  --region "$AWS_REGION" \
  --cluster-name "$CLUSTER_NAME" \
  --settings name=containerInsights,value=enabled
```

## 11. Store secrets in SSM Parameter Store

All sensitive variables in the task definitions use SSM SecureString parameters:

```bash
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/DATABASE_URL --type SecureString --value 'postgresql+asyncpg://...'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/DATABASE_URL_SYNC --type SecureString --value 'postgresql://...'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/REDIS_URL --type SecureString --value 'redis://...'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/CELERY_BROKER_URL --type SecureString --value 'redis://.../1'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/CELERY_RESULT_BACKEND --type SecureString --value 'redis://.../2'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/SECRET_KEY --type SecureString --value '<long-random-secret>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/VOICEBOOKER_SECRET --type SecureString --value '<long-random-secret>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/EMAIL_INBOX_INGEST_SECRET --type SecureString --value '<long-random-secret>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/BACKEND_URL --type SecureString --value 'https://api.hotel.example'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/FRONTEND_URL --type SecureString --value 'https://app.hotel.example'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/CORS_ORIGINS --type SecureString --value 'https://app.hotel.example,https://hotel.example'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/S3_BUCKET_NAME --type SecureString --value 'mg-one-hotel-prod-assets'
```

Add optional integrations only if used:

```bash
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/STRIPE_API_KEY --type SecureString --value '<stripe-key>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/STRIPE_WEBHOOK_SECRET --type SecureString --value '<stripe-webhook-secret>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/RESEND_API_KEY --type SecureString --value '<resend-key>'
aws ssm put-parameter --region "$AWS_REGION" --name /mg/prod/backend/ANTHROPIC_API_KEY --type SecureString --value '<anthropic-key>'
```

## 12. Build and push the backend image

```bash
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t "$ECR_REPOSITORY:$IMAGE_TAG" backend
docker tag "$ECR_REPOSITORY:$IMAGE_TAG" "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"
```

## 13. Register ECS task definitions

Replace `<ACCOUNT_ID>`, `<REGION>`, and `<IMAGE_TAG>` in the JSON templates, then:

```bash
aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file://infrastructure/aws/ecs-one-hotel/task-definitions/api-task.json
aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file://infrastructure/aws/ecs-one-hotel/task-definitions/worker-task.json
aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file://infrastructure/aws/ecs-one-hotel/task-definitions/beat-task.json
aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json file://infrastructure/aws/ecs-one-hotel/task-definitions/migrate-task.json
```

## 14. Run migrations before API rollout

```bash
aws ecs run-task \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER_NAME" \
  --launch-type FARGATE \
  --task-definition mg-backend-migrate \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$APP_SECURITY_GROUP_ID],assignPublicIp=DISABLED}"
```

Wait for the migration task to finish successfully before deploying or updating services.

## 15. Create ECS services

API:

```bash
aws ecs create-service \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER_NAME" \
  --service-name mg-backend-api \
  --task-definition mg-backend-api \
  --desired-count 2 \
  --launch-type FARGATE \
  --health-check-grace-period-seconds 60 \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$APP_SECURITY_GROUP_ID],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=<target-group-arn>,containerName=api,containerPort=8000"
```

Worker:

```bash
aws ecs create-service \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER_NAME" \
  --service-name mg-backend-worker \
  --task-definition mg-backend-worker \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$APP_SECURITY_GROUP_ID],assignPublicIp=DISABLED}"
```

Beat:

```bash
aws ecs create-service \
  --region "$AWS_REGION" \
  --cluster "$CLUSTER_NAME" \
  --service-name mg-backend-beat \
  --task-definition mg-backend-beat \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PRIVATE_SUBNET_1,$PRIVATE_SUBNET_2],securityGroups=[$APP_SECURITY_GROUP_ID],assignPublicIp=DISABLED}"
```

## 16. Updating services on a new release

After pushing a new image and registering new task definitions:

```bash
aws ecs update-service --region "$AWS_REGION" --cluster "$CLUSTER_NAME" --service mg-backend-api --task-definition mg-backend-api --force-new-deployment
aws ecs update-service --region "$AWS_REGION" --cluster "$CLUSTER_NAME" --service mg-backend-worker --task-definition mg-backend-worker --force-new-deployment
aws ecs update-service --region "$AWS_REGION" --cluster "$CLUSTER_NAME" --service mg-backend-beat --task-definition mg-backend-beat --force-new-deployment
```

## 17. Rollback strategy

1. Register or identify the previous stable task definition revision.
2. Point the API, worker, and beat services back to that revision.
3. Only roll back the database if the migration was explicitly reversible and already tested.
4. Keep `RUN_MASTER_SEED=0` in production always.

## 18. Validation after deploy

Check:

- `GET /health`
- `GET /api/ready`
- API logs in `/ecs/mg-backend-api`
- worker logs in `/ecs/mg-backend-worker`
- beat logs in `/ecs/mg-backend-beat`
- RDS connections visible
- Redis reachable from the app tasks
- Celery jobs executing

If `/api/ready` returns non-200, check DB, Redis, and Celery broker connectivity first.
