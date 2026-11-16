'use client';

import { useState } from 'react';

interface LogoR4Props {
    temaEscuro?: boolean;
    subtitulo?: string;
    compacto?: boolean;
}

export default function LogoR4({
                                   temaEscuro = true,
                                   subtitulo = 'Gestão Acadêmica',
                                   compacto = false,
                               }: LogoR4Props) {
    const [erroImagem, setErroImagem] = useState(false);

    return (
        <div className="flex items-center gap-3 select-none">
            {!erroImagem ? (
                <img
                    src="/logo-r4.png"
                    alt="Logo R4 Ensina"
                    onError={() => setErroImagem(true)}
                    className="w-11 h-11 object-contain shrink-0 drop-shadow-sm"
                />
            ) : (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 200 215"
                    fill="none"
                    aria-label="Logo R4 Ensina"
                    className="w-11 h-11 shrink-0 drop-shadow-sm"
                >
                    <path
                        d="M100 12C51.4 12 12 51.4 12 100C12 146.5 48.1 184.6 93.8 187.8L133.5 204.5C138.2 206.5 143.1 202.3 141.9 197.3L135.4 170.4C167.2 156.5 188 125.6 188 100C188 51.4 148.6 12 100 12Z"
                        fill="#F8FAFC"
                    />
                    <path
                        d="M100 19C55.3 19 19 55.3 19 100C19 142.8 52.3 177.9 94.3 180.8L130.2 195.8L124.5 171.8C155.1 159.4 181 131.6 181 100C181 55.3 144.7 19 100 19Z"
                        stroke="#0E7C86"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />
                    <circle cx="95" cy="87" r="65" fill="#C24124" />
                    <circle cx="109" cy="97" r="64" fill="#BE1E23" />
                    <circle cx="93" cy="109" r="64" fill="#0E7C86" />
                    <path d="M104 166L131 189L124 156Z" fill="#0E7C86" />
                    <circle cx="100" cy="102" r="57" fill="#231917" />
                    <circle
                        cx="100"
                        cy="102"
                        r="50"
                        stroke="#E7E2DD"
                        strokeWidth="1.8"
                        strokeDasharray="4 4"
                    />
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M63 82H86C92.5 82 96 85.8 96 92C96 96.8 93.4 100.2 88.8 101.4L97.5 116H100V122H88.5L79.8 103H76V116H80V122H63V116H67V88H63V82ZM76 88V97H84.5C86.8 97 88 95.6 88 92.5C88 89.4 86.8 88 84.5 88H76Z"
                        fill="#FFFFFF"
                    />
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M121 82H130V105H135V112H130V116H134V122H117V116H121V112H102V106L121 82ZM121 93L111 105H121V93Z"
                        fill="#FFFFFF"
                    />
                </svg>
            )}

            {!compacto && (
                <div className="leading-tight">
                    <p
                        className={`font-extrabold tracking-tight text-base ${
                            temaEscuro ? 'text-stone-100' : 'text-stone-900'
                        }`}
                    >
                        R4 ENSINA
                    </p>
                    <p
                        className={`text-[11px] font-semibold tracking-wide ${
                            temaEscuro ? 'text-[#25A4AF]' : 'text-[#0E7C86]'
                        }`}
                    >
                        {subtitulo}
                    </p>
                </div>
            )}
        </div>
    );
}