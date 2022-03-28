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
   ```
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
