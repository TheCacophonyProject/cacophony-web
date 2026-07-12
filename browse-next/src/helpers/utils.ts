import { computed, type Ref } from "vue";
import type { LoadedResource } from "@apiClient/types.ts";

export const resourceIsLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === null);

export const resourceFailedLoading = (val: Ref<LoadedResource<unknown>>) =>
  computed<boolean>(() => val.value === false);

export type NonEmptyArray<T> = [T, ...T[]];

export const upperFirst = (str: string): string => {
  const trim = str.trim();
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};
