import { computed, type Ref } from "vue";
import type { LoadedResource } from "@api/types.ts";

export const resourceIsLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === null);

export const resourceFailedLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === false);
