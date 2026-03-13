# API Notes

Base path: `/api`

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Auth uses httpOnly session cookies; no long-lived browser tokens in localStorage.

## Entries
- `GET /entries`
- `GET /entries/{slug}`
- `POST /entries`
- `PATCH /entries/{id}`
- `GET /entries/{id}/versions`
- `POST /entries/{id}/vote`
- `DELETE /entries/{id}/vote`
- `POST /entries/{id}/reports`

## Examples
- `POST /entries/{id}/examples`
- `PATCH /examples/{id}`
- `POST /examples/{id}/reports`

## Moderation
- `GET /mod/queue`
- `GET /mod/reports`
- `POST /mod/entries/{id}/approve`
- `POST /mod/entries/{id}/reject`
- `POST /mod/entries/{id}/dispute`
- `POST /mod/examples/{id}/approve`
- `POST /mod/examples/{id}/hide`
- `POST /mod/reports/{id}/resolve`

## Metadata
- `GET /tags`
- `GET /meta/parts-of-speech`
- `GET /meta/statuses`

## Error shape
All handled errors return:

```json
{
  "error": {
    "code": "string_code",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Pagination
List endpoints use page-based pagination parameters (`page`, `page_size`).
