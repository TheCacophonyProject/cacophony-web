import { reactive } from "vue";

export const isEmpty = (str: string): boolean => str.trim().length === 0;

export const delayMs = async (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const isValidName = (str: string): boolean =>
  str.length >= 3 && /(?=.*[A-Za-z])^[a-zA-Z0-9]+([_ \-a-zA-Z0-9])*$/.test(str);

export const formFieldInputText = (initialValue: string | boolean = "") =>
  reactive({
    value: initialValue.toString(),
    touched: false,
  });
