export interface TableCellValue<T> {
  value: T;
  pick?: string;
  cellClasses?: string[];
}

export interface CardTableItems<T> {
  headings: string[];
  values: {
    value: T;
    pick?: string;
    cellClasses?: string[];
  }[][];
}
