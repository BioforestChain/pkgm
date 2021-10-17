import { default as avaTest, Implementation, TestInterface } from "ava";

// import {Api} from 'ava/lib/api'

export const defineTest = <Context = unknown>(title: string, implementation: Implementation<Context>) => {
  return (avaTest as TestInterface<Context>)(title, implementation);
};
