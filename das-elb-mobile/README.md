# Das ELB Mobile

Phase 1 native restaurant guest app scaffold.

Current scope:

- guest session flow
- QR or manual table-code resolution
- menu browsing
- cart state
- order submission via the existing QR backend contract

## Backend contract

This app intentionally keeps the backend contract stable and uses the existing QR ordering endpoints:

- `GET /api/qr/menu/{code}`
- `POST /api/qr/order`
- `GET /api/qr/order/{order_id}/status`

No backend API changes are required for Phase 1.

## Environment

Set:

- `EXPO_PUBLIC_API_BASE_URL`

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.das-elb.com/api
```

## Scripts

```bash
npm run start
npm run android
npm run ios
npm test
```
