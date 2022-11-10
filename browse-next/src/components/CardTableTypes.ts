import type { Component } from "vue";

export interface CardTableActionItem {
  type: string;
  action: () => void;
  label?: string | (() => string);
  align?: string;
  disabled?: () => boolean;
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
}

export const extractComponent = (value: CardTableValue): string =>
  (value as CardTableActionComponent).component as unknown as string;
export const extractAction = (value: CardTableValue): (() => void) =>
  (typeof value === "object" && (value as CardTableActionItem).action) ||
  (() => {
    return;
  });
export const extractLabel = (value: CardTableValue): string | (() => string) =>
  (typeof value === "object" &&
    (value as CardTableActionItem).type === "button" &&
    (value as CardTableActionButton).label) ||
  "";
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
// Just needed in Vue templates to get past typescript checks in release mode
export const castButton = (value: CardTableValue): CardTableActionButton =>
  value as CardTableActionButton;
export const castComponent = (
  value: CardTableValue
): CardTableActionComponent => value as CardTableActionComponent;

export const componentIsDisabled = (value: CardTableValue): boolean =>
  !!((value as CardTableActionItem).disabled && (value as any).disabled());

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
