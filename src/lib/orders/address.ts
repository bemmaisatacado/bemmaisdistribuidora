export const brazilStates =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export const addressFields = [
  "recipient",
  "postal_code",
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "country",
  "reference",
  "no_number",
] as const;
export type DeliveryAddress = Partial<Record<(typeof addressFields)[number], string>>;
export const emptyDeliveryAddress: DeliveryAddress = { country: "BR" };
export function normalizeDeliveryAddress(raw: DeliveryAddress): DeliveryAddress {
  return Object.fromEntries(
    addressFields.flatMap((key) => {
      const value = raw[key]?.trim();
      if (!value) return [];
      return [
        [
          key,
          key === "postal_code"
            ? value.replace(/[ .-]/g, "")
            : key === "state" || key === "country"
              ? value.toUpperCase()
              : value,
        ],
      ];
    }),
  );
}
export function deliveryAddressComplete(raw: DeliveryAddress | null): boolean {
  if (!raw) return false;
  const a = normalizeDeliveryAddress(raw);
  return (
    ["recipient", "street", "district", "city"].every((key) => {
      const value = a[key as keyof DeliveryAddress];
      return Boolean(value && value.length <= 200);
    }) &&
    /^[0-9]{8}$/.test(a.postal_code ?? "") &&
    a.postal_code !== "00000000" &&
    brazilStates.includes(a.state ?? "") &&
    a.country === "BR" &&
    (a.no_number === "true"
      ? !a.number
      : Boolean(
          a.number &&
          a.number.length <= 20 &&
          !["s/n", "sn", "sem número", "sem numero"].includes(a.number.toLowerCase()),
        )) &&
    (!a.no_number || a.no_number === "true" || a.no_number === "false") &&
    [a.complement, a.reference].every((value) => !value || value.length <= 200)
  );
}
