import { ref } from "vue";

export function useLoggedInState() {
  // state encapsulated and managed by the composable
  const x = ref(0);
  const y = ref(0);

  // expose managed state as return value
  return { x, y };
}
