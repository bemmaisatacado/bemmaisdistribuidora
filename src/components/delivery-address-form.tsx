import { addressFields, brazilStates, type DeliveryAddress } from "@/lib/orders/address";
const labels: Record<(typeof addressFields)[number], string> = {
  recipient: "Nome do destinatário",
  postal_code: "CEP",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento (opcional)",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  country: "País",
  reference: "Referência (opcional)",
  no_number: "Sem número",
};
export function DeliveryAddressForm({
  value,
  onChange,
}: {
  value: DeliveryAddress;
  onChange: (address: DeliveryAddress) => void;
}) {
  return (
    <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
      <legend className="mb-3 font-semibold">Endereço completo de entrega</legend>
      {addressFields
        .filter((key) => key !== "no_number" && key !== "country")
        .map((key) => (
          <label key={key} className="grid min-w-0 gap-1 text-sm">
            {labels[key]}
            {key === "state" ? (
              <select
                value={value.state ?? ""}
                onChange={(e) => onChange({ ...value, state: e.target.value })}
                className="min-w-0 rounded border p-3"
              >
                <option value="">Selecione a UF</option>
                {brazilStates.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            ) : (
              <input
                value={value[key] ?? ""}
                disabled={key === "number" && value.no_number === "true"}
                maxLength={key === "number" ? 20 : key === "postal_code" ? 9 : 200}
                inputMode={key === "postal_code" ? "numeric" : undefined}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                className="min-w-0 rounded border p-3"
              />
            )}
          </label>
        ))}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.no_number === "true"}
          onChange={(e) =>
            onChange({
              ...value,
              no_number: String(e.target.checked),
              number: e.target.checked ? "" : value.number,
            })
          }
        />
        Endereço sem número (S/N)
      </label>
      <p className="text-sm">País: Brasil</p>
    </fieldset>
  );
}
