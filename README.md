# Photo Uploader

A Next.js application for uploading photos to Yandex Disk.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `app/` - Next.js App Router pages and layouts
- `data/` - User data storage (users.json is gitignored)
- `legacy/` - Legacy HTML implementation
- `public/` - Static assets

## Configuration

Copy `data/users.example.json` to `data/users.json` for local development.

## Security

**⚠️ Never commit real credentials or user data!**

- User data file `data/users.json` is excluded from git
- Environment variables should be in `.env.local` (also gitignored)
- See `data/users.example.json` for the expected user data format
# Build Instructions
