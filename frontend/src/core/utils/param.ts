/** A rule parameter as the engine sends it: a number and its unit (ADR-0036, ADR-0038). */
export type ParamValue = { value: number; unit: "amount" | "percent" | "multiple" };

const unitSuffix: Record<ParamValue["unit"], string> = {
  amount: "CZK",
  percent: "%",
  multiple: "×",
};

/** A parameter's display value and unit: an amount is CZK already (ADR-0037), the rest as stored. */
export const paramParts = ({ value, unit }: ParamValue) => ({
  value: value.toLocaleString("en-US"),
  unit: unitSuffix[unit],
});

export const paramText = (param: ParamValue) => {
  const { value, unit } = paramParts(param);
  return unit ? `${value} ${unit}` : value;
};
