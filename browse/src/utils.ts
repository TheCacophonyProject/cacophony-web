import { Draft, produce, Immutable } from "immer";
import {
  Ref,
  shallowRef,
  DeepReadonly,
  getCurrentInstance,
  watchEffect,
} from "@vue/composition-api";
import type VueRouter from "vue-router";
import type { Route } from "vue-router";

export function shouldViewAsSuperUser(): boolean {
  return localStorage.getItem("view-as") !== "regular";
}

export function changedContext<T>(
  old: Set<T>,
  curr: Set<T>,
): { added: Set<T>; deleted: Set<T> } {
  return {
    added: new Set([...curr].filter((x) => !old.has(x))),
    deleted: new Set([...old].filter((x) => !curr.has(x))),
  };
}

export function debounce(func: (...args: any[]) => void, timeout = 100) {
  let timer: number;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      func(...args);
    }, timeout);
  };
}

export function UUIDv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type Updater<T> = (draft: Draft<T>) => void;

export type SetState<T> = (updater: Updater<T> | T) => void;

export type ReadonlyState<T> = { readonly value: DeepReadonly<T> };

export function useState<T>(base: T): [Ref<T>, SetState<T>] {
  const state = shallowRef<T>(base);
  const setState = (updater: Updater<T> | Immutable<T> | T) => {
    const recipe = (
      typeof updater === "function" ? updater : () => updater
    ) as Updater<T>;
    state.value = produce(state.value, recipe);
  };
  return [state, setState];
}

export function useRouter(): VueRouter {
  const instance = getCurrentInstance();
  if (instance) {
    return instance.proxy.$router;
  }
  //console.error("Outside Scope: cannot access Vue instance for router");
  return undefined as any;
}

export function useRoute(): Ref<Route> {
  const instance = getCurrentInstance();
  if (instance) {
    const [route, setRoute] = useState<Route>(instance.proxy.$route);
    watchEffect(() => setRoute(instance.proxy.$route));
    return route;
  }
  // console.error("Outside Scope: cannot access Vue instance for route");
  return undefined as any;
}

export function createSVGElement(
  element: {
    attributes?: Object;
    style?: Object;
  },
  elementType: string,
): SVGElement {
  const svgns = "http://www.w3.org/2000/svg";
  const svgElement = document.createElementNS(svgns, elementType);
  if (element.attributes) {
    Object.keys(element.attributes).forEach((key) => {
      svgElement.setAttribute(key, element.attributes[key]);
    });
  }
  if (element.style) {
    Object.keys(element.style).forEach((key) => {
      svgElement.style.setProperty(key, element.style[key]);
    });
  }
  return svgElement;
}
