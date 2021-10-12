## Roadmap

- [ ] typings 文件夹下的`.ts`文件, 以及任意文件夹下的`.type.ts`文件,都会全部被包含到 prod 项目中的 typings 文件夹下
- [ ] bin 文件夹下, `.bin.ts` 后缀的文件自动变成出口文件,用于输出 package.json 的 bin 指令
- [ ] tests 文件夹下,`.test.ts`后缀的文件自动变成出口文件,用于输出测试用的可执行文件,但会被排除出 prod 项目
- [ ] `bin/dev` 需要启动以下作业:
  - [ ] 监听更新 typescript 相关的配置文件与自动生成的代码
