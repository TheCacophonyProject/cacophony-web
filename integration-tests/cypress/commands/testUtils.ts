import { generateUUID } from "listr2/dist/utils/uuid";

export const uniqueName = (str: string): string => {
  return `${str}-${btoa(generateUUID().substring(0, 4)).replace(/=/g, "")}`;
};
