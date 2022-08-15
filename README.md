# Package Management Toolset

pkgm 是一套用于 BFS 生态下应用开发的工具集。
目前主要提供了`@bfchain/pkgm-bfsp`和`@bfchain/pkgm-bfsw`，分别用于管理单项目和多项目的开发。

## 目标 Goals

- 🎯 专注于[TypeScript](https://www.typescriptlang.org/)开发而无需关心各种配置文件
- 🍔 支持多平台编译，通过定义不同 Profile，一次编译，到处运行
- 🧩 兼容 npm 生态

## 快速开始，Get Started

### 单项目开发(bfsp)

1. 全局安装 `@bfchain/pkgm`

   ```shell
   npm i -g @bfchain/pkgm
   # or
   yarn global add @bfchain/pkgm
   ```

1. 创建项目

   ```shell
   bfsp create <projectName>
   ```

1. 根据指令进入对应目录开始启动开发

   ```shell
   cd <projectName> && bfsp dev
   ```

### 工作空间(bfsw)

> 将多个项目组合在一起，联动编译。对应传统的`monorepo`开发风格

1. 创建项目

   ```shell
   bfsw create <projectName>
   ```

1. 根据指令进入对应目录开始启动开发

   ```shell
   cd <projectName> && bfsw dev
   ```

## 配置

### #bfsp.ts (TBD)

### #bfsw.ts (TBD)

## How to contribute

工作方式&流程参考 [./flow.md](./flow.md)

## 开发者

### 快速开始参与开发

```shell
yarn install # 安装依赖
yarn dev # 启动tsc编译

# 使用tsc编译出来的文件即可运行
node path/to/bfsp/dist/src/bin/bfsp.cmd.mjs dev
node path/to/bfsw/dist/src/bin/bfsw.cmd.mjs dev
```

### 打包发布

打包发布 bin 文件，即 bfsp 与 bfsw 两个指令，这里使用 vite 编译。
因为该项目依赖了很多工具链，如果要直接使用 tsc 编译出来的结果来运行的话，会导致用户安装`@bfchain/pkgm`的时间会很长。
所以我们将很多依赖调整成`devDependencies`，所以用户在安装`@bfchain/pkgm`的时候就会节省很多时间。但于此同时，bin 文件要正常运行，就要在开发阶段将这些`devDependencies`进行 bundle。

```shell
# 在运行了yarn dev 且编译通过之后

npm i -g lerna # 手动全局安装 lerna
yarn bin:dev # 使用 lerna 来并行执行多个指令

# 使用vite编译出来的文件运行
node path/to/bfsp/build/bfsp.bin.mjs dev
node path/to/bfsw/build/bfsw.bin.mjs dev
```
