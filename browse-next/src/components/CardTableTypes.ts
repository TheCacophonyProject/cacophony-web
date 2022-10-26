import type { Component } from "vue";

export type CardTableActionButton = {
  component: Component;
  action: () => void;
};

export const extractComponent = (value: CardTableValue): Component =>
  (value as CardTableActionButton).component;
export const extractAction = (value: CardTableValue): (() => void) =>
  (value as CardTableActionButton).action;
export const isComponent = (value: CardTableValue) => {
  return (
    typeof value === "object" && "component" in (value as CardTableActionButton)
  );
};

export type CardTableValue = string | number | Date | CardTableActionButton;

export interface CardTableItems {
  headings: string[];
  values: CardTableValue[][];
}
