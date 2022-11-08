import type { Component } from "vue";

export type CardTableActionComponent = {
  component: Component;
  action: () => void;
};

export type CardTableActionButton = {
  icon?: string;
  classes?: string[];
  color?: string;
  rotate?: number;
  label?: string;
  action: () => void;
};

export const extractComponent = (value: CardTableValue): Component =>
  (value as CardTableActionComponent).component;
export const extractComponentAction = (value: CardTableValue): (() => void) =>
  (value as CardTableActionComponent).action;
export const extractButtonAction = (value: CardTableValue): (() => void) =>
  (value as CardTableActionButton).action;
export const isComponent = (value: CardTableValue) => {
  return (
    typeof value === "object" &&
    "component" in (value as CardTableActionComponent)
  );
};
export const isButton = (value: CardTableValue) => {
  return (
    typeof value === "object" &&
    !("component" in (value as CardTableActionComponent))
  );
};

export type CardTableValue =
  | string
  | number
  | Date
  | CardTableActionButton
  | CardTableActionComponent;

export interface CardTableItems {
  headings: string[];
  values: CardTableValue[][];
}
