# BookNook Backend

Express and MongoDB API for the BookNook online library.

## Live URLs

- Backend API: https://book-nook-backend-two.vercel.app
- Frontend: https://book-nook-frontend-two.vercel.app

## Features

- Browse all books and latest arrivals
- Add, edit, and delete books owned by the signed-in user
- Borrow available books and return borrowed books
- Verify protected API requests with Better Auth JWTs

## API Endpoints

Use `https://book-nook-backend-two.vercel.app` as the base URL. 🔒 means the request needs an `Authorization: Bearer <token>` header.

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| GET | `/books` | Public | Get all books |
| GET | `/books?limit=6` | Public | Get the six latest books |
| GET | `/books?mine=true` | 🔒 | Get books added by the signed-in user |
| GET | `/books/:id` | 🔒 | Get one book by its ID |
| POST | `/books` | 🔒 | Add a book |
| PATCH | `/books/:id` | 🔒 | Edit a book you added |
| DELETE | `/books/:id` | 🔒 | Delete a book you added |
| GET | `/borrows` | 🔒 | Get your borrowed books |
| POST | `/borrows` | 🔒 | Borrow a book |
| DELETE | `/borrows/:id` | 🔒 | Return a borrowed book |

New borrow records are stored in MongoDB's `borrows` collection with `bookId`, `bookTitle`, `bookImage`, `userEmail`, `borrowDate`, and `returnDate`. Existing records in the earlier `myBooks` collection remain visible and can still be returned.

Replace `:id` with the book ID or borrow record ID. The latest-arrivals endpoint is `/books?limit=6`; there is no separate `/new-arrivals` route.

## Authentication

Protected endpoints require a valid Better Auth JWT:

```http
Authorization: Bearer <token>
```

The API verifies tokens using the Better Auth JWKS endpoint and gets user identity from the verified token.

## Environment Variables

Configure these in the backend deployment environment:

| Variable | Description |
| --- | --- |
| `MONGODB_URL` | MongoDB connection string |
| `BETTER_AUTH_URL` | Base URL of the Better Auth server; must match its configured URL |
| `PORT` | Optional server port; defaults to `5000` |

Do not commit environment files or credentials.
