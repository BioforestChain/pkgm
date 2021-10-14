export const defineBin = <T extends Bfsp.Bin.CommandConfig>(
  funName: string,
  config: T,
  hanlder: (
    params: Bfsp.Bin.ToParamsType<Bfsp.Bin.GetParamsInputType<T>>,
    rests: Bfsp.Bin.ToRestsTupleType<Bfsp.Bin.GetRestsInputType<T>>
  ) => unknown
) => {
  console.log(hanlder);
};
