export let API_ROOT = import.meta.env.VITE_API;
if (API_ROOT === "CURRENT_HOST") {
  // In production, use whatever the current host is, since it should be proxying the api
  API_ROOT = "";
}
