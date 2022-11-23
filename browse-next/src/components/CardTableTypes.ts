export interface CardTableItem<T> {
  value: T;
  cellClasses?: string[];
}
export type GenericCardTableValue<T> = T | CardTableItem<T>;
export type CardTableRow<T> = Record<string, GenericCardTableValue<T>>;
export type CardTableRows<T> = CardTableRow<T>[];
