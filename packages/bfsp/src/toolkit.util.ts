export const jsonClone = <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T;
