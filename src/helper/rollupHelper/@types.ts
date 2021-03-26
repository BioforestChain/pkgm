declare namespace PKGM {
  interface RollupPlugin {
    toPlugin(): import('rollup').Plugin;
  }

  namespace RollupPlugin {
    interface VirtualOptions {
      [id: string]: string;
    }
    interface ProfileOptions {
      platform?: PKGM.Profile.Platform;
      jsRuntime?: PKGM.Profile.JsRuntime;
      runtimeMode?: PKGM.Profile.RuntimeMode;
      channel?: PKGM.Profile.Channel;
    }
  }

  namespace Config.BfsProject.Plugins {
    interface Rollup {
      preserveModules?: boolean;
      rollupCommonJSOptions?: import('@rollup/plugin-commonjs').RollupCommonJSOptions;
      rollupNodeResolveOptions?: import('@rollup/plugin-node-resolve').RollupNodeResolveOptions;
      rollupProfileOptions: RollupPlugin.ProfileOptions;
      rollupVirtualOptions?: RollupPlugin.VirtualOptions;
      rollupTerserOptions?: import('rollup-plugin-terser').Options;
    }
  }
}
