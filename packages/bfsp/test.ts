import { default as avaTest, Implementation, TestFn } from "ava";

// import {Api} from 'ava/lib/api'

export const defineTest = <Context = unknown>(title: string, implementation: Implementation<[], Context>) => {
  return (avaTest as TestFn<Context>)(title, implementation);
};
