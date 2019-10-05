## PR-Train API server

It's an API server for pr-train web app and browser extension.

### Application Setup

* Run `npm install`.
* Copy `.env.example` to `.env`.
* In the `.env` file, replace the `GITHUB_ORG` with an org you have access to. The org should have some teams created as well.
* Generate a GitHub token that has that org's access. Put that token in `GITHUB_TOKEN` inside .env file.

The app and extension lives [here](https://github.com/itaditya/pr-train).
