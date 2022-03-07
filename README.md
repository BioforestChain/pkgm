# Package Management Toolset

pkgm 是一套用于 BFS 生态下应用开发的工具集，包括了`@bfchain/pkgm-bfsp`和`@bfchain/pkgm-bfsw`分别用于创建单项目和多项目(monorepo)

## Goals

- 🎯 专注于[TypeScript](https://www.typescriptlang.org/)开发而无需关心各种配置文件
- 🍔 支持多平台编译，通过定义不同 Profile，一次编译，到处运行
- 🧩 兼容 npmjs 生态

## Get Started

### 单项目开发(bfsp)

1. 全局安装 `@bfchain/pkgm-bfsp`

```
yarn global add @bfchain/pkgm-bfsp
```

或者

```
npm i -g @bfchain/pkgm-bfsp
```

2. 创建项目

```
bfsp create <projectName>
```

3. 根据指令进入对应目录开始启动开发

```
cd <projectName> && bfsp dev
```

### 多项目开发(bfsw)

1. 全局安装 `@bfchain/pkgm-bfsw`

```
yarn global add @bfchain/pkgm-bfsw
```

或者

```
npm i -g @bfchain/pkgm-bfsw
```

2. 创建项目

```
bfsw create <projectName>
```

3. 根据指令进入对应目录开始启动开发

```
cd <projectName> && bfsw dev
```

## 配置

### #bfsp.ts (TBD)

### #bfsw.ts (TBD)

## How to contribute

工作方式&流程参考 [./flow.md](./flow.md)
