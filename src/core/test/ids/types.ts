/**
 * Enforces that the chosen handler prop and `testId` are always provided together.
 * A handler without `testId` is a compile error.
 *
 * @example
 *   type ButtonProps = WithRequiredTestId<BaseButtonProps>;              // onClick + testId
 *   type InputProps  = WithRequiredTestId<BaseInputProps, "onChange">;   // onChange + testId
 */
export type WithRequiredTestId<
  TBase extends object,
  THandler extends keyof TBase = "onClick" extends keyof TBase ? "onClick" : never,
> =
  | (Omit<TBase, THandler | "testId"> & { [K in THandler]-?: NonNullable<TBase[K]> } & {
      testId: string;
    })
  | (Omit<TBase, THandler | "testId"> & { [K in THandler]?: undefined } & { testId?: string });
