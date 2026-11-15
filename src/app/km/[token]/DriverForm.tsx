"use client";

import { useRef, useState, useTransition } from "react";
import { responderKm } from "./actions";
import { compressImage } from "@/lib/compress";

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-neon";

function getGeo(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

function PhotoField({
  label,
  selected,
  onChange,
}: {
  label: string;
  selected: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-3">
      <span className="text-sm">
        📷 {label} <span className="text-neon">*</span>
      </span>
      <span className={selected ? "text-sm text-success" : "text-xs text-muted"}>
        {selected ? "✓ Foto pronta" : "Toque para tirar"}
      </span>
      {/* capture força a câmera ao vivo (sem galeria) */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

const SIDES = ["Frente", "Traseira", "Lado esquerdo", "Lado direito"] as const;

export function DriverForm({
  token,
  vehicleLabel,
  plate,
}: {
  token: string;
  vehicleLabel: string;
  plate: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [success, setSuccess] = useState(false);

  const dashRef = useRef<File | null>(null);
  const plateRef = useRef<File | null>(null);
  const sideRefs = useRef<(File | null)[]>([null, null, null, null]);

  const [dashSel, setDashSel] = useState(false);
  const [plateSel, setPlateSel] = useState(false);
  const [sidesSel, setSidesSel] = useState([false, false, false, false]);

  const [informedKm, setInformedKm] = useState("");
  const [fuelLevel, setFuelLevel] = useState("");
  const [notes, setNotes] = useState("");

  if (success) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-6 text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-2 text-lg font-semibold text-success">KM registrada!</h2>
        <p className="mt-1 text-sm text-muted">
          Obrigado. Sua quilometragem e as fotos foram enviadas com sucesso.
        </p>
      </div>
    );
  }

  function submit() {
    setError(undefined);
    if (!informedKm) return setError("Informe a quilometragem atual.");
    if (!dashRef.current) return setError("Tire a foto do painel.");
    if (!plateRef.current) return setError("Tire a foto da placa.");
    for (let i = 0; i < SIDES.length; i++) {
      if (!sideRefs.current[i]) return setError(`Tire a foto: ${SIDES[i]}.`);
    }

    startTransition(async () => {
      try {
        setStatus("Obtendo localização...");
        const geo = await getGeo();
        if (!geo) {
          setStatus(undefined);
          setError(
            "Precisamos da sua localização para validar o envio. Ative o GPS e permita o acesso à localização."
          );
          return;
        }

        setStatus("Otimizando e enviando fotos...");
        const fd = new FormData();
        fd.set("informedKm", informedKm);
        fd.set("fuelLevel", fuelLevel);
        fd.set("notes", notes);
        fd.set("latitude", String(geo.lat));
        fd.set("longitude", String(geo.lng));
        fd.set("dashboardPhoto", await compressImage(dashRef.current!));
        fd.set("platePhoto", await compressImage(plateRef.current!));
        for (const f of sideRefs.current) {
          if (f) fd.append("vehiclePhotos", await compressImage(f));
        }

        const res = await responderKm(token, {}, fd);
        setStatus(undefined);
        if (res.error) setError(res.error);
        else if (res.success) setSuccess(true);
      } catch {
        setStatus(undefined);
        setError("Ocorreu um erro ao enviar. Tente novamente.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs text-muted">Veículo</p>
        <p className="font-semibold">{vehicleLabel}</p>
        <p className="text-sm text-muted">Placa {plate}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="informedKm" className="text-sm font-medium">
          Quilometragem atual (KM) <span className="text-neon">*</span>
        </label>
        <input
          id="informedKm"
          type="number"
          inputMode="numeric"
          value={informedKm}
          onChange={(e) => setInformedKm(e.target.value)}
          className={inputClass}
          placeholder="Ex.: 125430"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fuelLevel" className="text-sm font-medium">
          Nível de combustível
        </label>
        <select
          id="fuelLevel"
          value={fuelLevel}
          onChange={(e) => setFuelLevel(e.target.value)}
          className={inputClass}
        >
          <option value="">Selecione...</option>
          <option value="Reserva">Reserva</option>
          <option value="1/4">1/4</option>
          <option value="1/2">1/2</option>
          <option value="3/4">3/4</option>
          <option value="Cheio">Cheio</option>
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Fotos obrigatórias (tiradas na hora)</p>
        <PhotoField
          label="Painel (KM)"
          selected={dashSel}
          onChange={(f) => {
            dashRef.current = f;
            setDashSel(Boolean(f));
          }}
        />
        <PhotoField
          label="Placa"
          selected={plateSel}
          onChange={(f) => {
            plateRef.current = f;
            setPlateSel(Boolean(f));
          }}
        />
        {SIDES.map((label, i) => (
          <PhotoField
            key={label}
            label={label}
            selected={sidesSel[i]}
            onChange={(f) => {
              sideRefs.current[i] = f;
              setSidesSel((prev) => {
                const next = [...prev];
                next[i] = Boolean(f);
                return next;
              });
            }}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Observações
        </label>
        <textarea
          id="notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
      >
        {pending ? status ?? "Enviando..." : "Enviar KM"}
      </button>

      <p className="text-center text-xs text-muted">
        As fotos devem ser tiradas na hora. Registramos data, hora e localização para conferência.
      </p>
    </div>
  );
}
