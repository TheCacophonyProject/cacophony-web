import type { Component } from "vue";

export interface CardTableActionItem {
  type: string;
  action: () => void;
}

export interface CardTableActionComponent extends CardTableActionItem {
  type: "component";
  component: Component;
}

export interface CardTableActionButton extends CardTableActionItem {
  type: "button";
  icon?: string;
  classes?: string[];
  color?: string;
  rotate?: number;
  label?: string;
  disabled?: () => void;
}

export const extractComponent = (value: CardTableValue): string =>
  (value as CardTableActionComponent).component as unknown as string;
export const extractAction = (value: CardTableValue): (() => void) =>
  (typeof value === "object" && (value as CardTableActionItem).action) ||
  (() => {
    return;
  });
export const isComponent = (value: CardTableValue) => {
  return (
    typeof value === "object" &&
    (value as CardTableActionItem).type === "component"
  );
};
export const isButton = (value: CardTableValue) => {
  return (
    typeof value === "object" &&
    (value as CardTableActionItem).type === "button"
  );
};

export type CardTableValue =
  | string
  | number
  | Date
  | CardTableActionButton
  | CardTableActionComponent
  | CardTableActionItem;

export interface CardTableItems {
  headings: string[];
  values: CardTableValue[][];
}
