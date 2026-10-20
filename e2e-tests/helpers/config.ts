// Defaults match the local docker api. Override via environment variables, e.g. in a `.env` file.
export const SUPER_USER = {
  userName: process.env.E2E_SUPER_USER_NAME ?? "admin_test",
  email: process.env.E2E_SUPER_USER_EMAIL ?? "admin@email.com",
  password: process.env.E2E_SUPER_USER_PASSWORD ?? "admin_test",
};
