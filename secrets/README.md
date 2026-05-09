# secrets/

This directory holds runtime credentials that are mounted into the backend
container by `docker-compose.yml`. **Nothing here gets committed** except
this README and the `.gitkeep` placeholder.

## Files expected

| File                    | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `firebase-admin.json`   | Firebase service-account JSON for verifying user ID tokens.          |
| `credentials.json`      | (Optional) Google OAuth client config for the calendar integration. |
| `token.json`            | (Optional) Cached Google OAuth user token, generated on first run.   |

## Getting `firebase-admin.json`

1. Open the [Firebase Console](https://console.firebase.google.com/), select
   the same project the frontend uses (see
   `frontend/.env.local` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`).
2. **Project settings → Service accounts → Generate new private key**.
3. Save the downloaded JSON as `secrets/firebase-admin.json` (this exact
   path is what `docker-compose.yml` and `backend/.env.example` reference).

Once the file exists, set `KINETIC_AUTH_REQUIRED=true` in `backend/.env`
to enforce auth on every protected endpoint.
