/**
 * Catálogo DIVIPOLA (DANE) para preguntas de ubicación.
 * Incluye los 33 departamentos (32 + Bogotá D.C.), sus capitales y municipios principales,
 * y los 116 municipios de Cundinamarca. Sin dependencias: se usa en cliente y servidor.
 * Para ampliar el catálogo basta agregar municipios a la lista del departamento.
 */
export type Municipio = { code: string; name: string };
export type Departamento = { code: string; name: string; municipios: Municipio[] };

const M = (s: string): Municipio[] =>
  s.split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const [code, ...n] = x.split(" "); return { code, name: n.join(" ") }; });

export const DIVIPOLA: Departamento[] = [
  { code: "05", name: "Antioquia", municipios: M("05001 Medellín;05045 Apartadó;05088 Bello;05129 Caldas;05212 Copacabana;05266 Envigado;05308 Girardota;05360 Itagüí;05376 La Ceja;05380 La Estrella;05615 Rionegro;05631 Sabaneta;05837 Turbo") },
  { code: "08", name: "Atlántico", municipios: M("08001 Barranquilla;08296 Galapa;08433 Malambo;08573 Puerto Colombia;08638 Sabanalarga;08758 Soledad") },
  { code: "11", name: "Bogotá D.C.", municipios: M("11001 Bogotá D.C.") },
  { code: "13", name: "Bolívar", municipios: M("13001 Cartagena de Indias;13052 Arjona;13430 Magangué;13836 Turbaco") },
  { code: "15", name: "Boyacá", municipios: M("15001 Tunja;15176 Chiquinquirá;15238 Duitama;15516 Paipa;15759 Sogamoso;15407 Villa de Leyva") },
  { code: "17", name: "Caldas", municipios: M("17001 Manizales;17174 Chinchiná;17380 La Dorada;17541 Riosucio;17873 Villamaría") },
  { code: "18", name: "Caquetá", municipios: M("18001 Florencia;18753 San Vicente del Caguán") },
  { code: "19", name: "Cauca", municipios: M("19001 Popayán;19698 Santander de Quilichao;19573 Puerto Tejada") },
  { code: "20", name: "Cesar", municipios: M("20001 Valledupar;20011 Aguachica;20060 Bosconia") },
  { code: "23", name: "Córdoba", municipios: M("23001 Montería;23162 Cereté;23417 Lorica;23660 Sahagún") },
  {
    code: "25", name: "Cundinamarca", municipios: M(`25001 Agua de Dios;25019 Albán;25035 Anapoima;25040 Anolaima;25599 Apulo;25053 Arbeláez;25086 Beltrán;25095 Bituima;25099 Bojacá;
      25120 Cabrera;25123 Cachipay;25126 Cajicá;25148 Caparrapí;25151 Cáqueza;25154 Carmen de Carupa;25168 Chaguaní;25175 Chía;25178 Chipaque;25181 Choachí;25183 Chocontá;
      25200 Cogua;25214 Cota;25224 Cucunubá;25245 El Colegio;25258 El Peñón;25260 El Rosal;25269 Facatativá;25279 Fómeque;25281 Fosca;25286 Funza;25288 Fúquene;25290 Fusagasugá;
      25293 Gachalá;25295 Gachancipá;25297 Gachetá;25299 Gama;25307 Girardot;25312 Granada;25317 Guachetá;25320 Guaduas;25322 Guasca;25324 Guataquí;25326 Guatavita;
      25328 Guayabal de Síquima;25335 Guayabetal;25339 Gutiérrez;25368 Jerusalén;25372 Junín;25377 La Calera;25386 La Mesa;25394 La Palma;25398 La Peña;25402 La Vega;
      25407 Lenguazaque;25426 Machetá;25430 Madrid;25436 Manta;25438 Medina;25473 Mosquera;25483 Nariño;25486 Nemocón;25488 Nilo;25489 Nimaima;25491 Nocaima;25513 Pacho;
      25518 Paime;25524 Pandi;25530 Paratebueno;25535 Pasca;25572 Puerto Salgar;25580 Pulí;25592 Quebradanegra;25594 Quetame;25596 Quipile;25612 Ricaurte;
      25645 San Antonio del Tequendama;25649 San Bernardo;25653 San Cayetano;25658 San Francisco;25662 San Juan de Rioseco;25718 Sasaima;25736 Sesquilé;25740 Sibaté;
      25743 Silvania;25745 Simijaca;25754 Soacha;25758 Sopó;25769 Subachoque;25772 Suesca;25777 Supatá;25779 Susa;25781 Sutatausa;25785 Tabio;25793 Tausa;25797 Tena;
      25799 Tenjo;25805 Tibacuy;25807 Tibirita;25815 Tocaima;25817 Tocancipá;25823 Topaipí;25839 Ubalá;25841 Ubaque;25843 Villa de San Diego de Ubaté;25845 Une;25851 Útica;
      25506 Venecia;25862 Vergara;25867 Vianí;25871 Villagómez;25873 Villapinzón;25875 Villeta;25878 Viotá;25885 Yacopí;25898 Zipacón;25899 Zipaquirá`),
  },
  { code: "27", name: "Chocó", municipios: M("27001 Quibdó;27361 Istmina") },
  { code: "41", name: "Huila", municipios: M("41001 Neiva;41298 Garzón;41396 La Plata;41551 Pitalito") },
  { code: "44", name: "La Guajira", municipios: M("44001 Riohacha;44430 Maicao;44847 Uribia") },
  { code: "47", name: "Magdalena", municipios: M("47001 Santa Marta;47189 Ciénaga;47288 Fundación") },
  { code: "50", name: "Meta", municipios: M("50001 Villavicencio;50006 Acacías;50313 Granada;50573 Puerto López") },
  { code: "52", name: "Nariño", municipios: M("52001 Pasto;52356 Ipiales;52835 San Andrés de Tumaco") },
  { code: "54", name: "Norte de Santander", municipios: M("54001 Cúcuta;54498 Ocaña;54518 Pamplona;54874 Villa del Rosario") },
  { code: "63", name: "Quindío", municipios: M("63001 Armenia;63130 Calarcá;63401 La Tebaida;63470 Montenegro") },
  { code: "66", name: "Risaralda", municipios: M("66001 Pereira;66170 Dosquebradas;66682 Santa Rosa de Cabal") },
  { code: "68", name: "Santander", municipios: M("68001 Bucaramanga;68081 Barrancabermeja;68276 Floridablanca;68307 Girón;68547 Piedecuesta;68679 San Gil") },
  { code: "70", name: "Sucre", municipios: M("70001 Sincelejo;70215 Corozal") },
  { code: "73", name: "Tolima", municipios: M("73001 Ibagué;73268 Espinal;73349 Honda;73449 Melgar") },
  { code: "76", name: "Valle del Cauca", municipios: M("76001 Cali;76109 Buenaventura;76111 Guadalajara de Buga;76147 Cartago;76364 Jamundí;76520 Palmira;76834 Tuluá;76892 Yumbo") },
  { code: "81", name: "Arauca", municipios: M("81001 Arauca;81736 Saravena") },
  { code: "85", name: "Casanare", municipios: M("85001 Yopal;85010 Aguazul;85440 Villanueva") },
  { code: "86", name: "Putumayo", municipios: M("86001 Mocoa;86568 Puerto Asís") },
  { code: "88", name: "Archipiélago de San Andrés, Providencia y Santa Catalina", municipios: M("88001 San Andrés;88564 Providencia") },
  { code: "91", name: "Amazonas", municipios: M("91001 Leticia;91540 Puerto Nariño") },
  { code: "94", name: "Guainía", municipios: M("94001 Inírida") },
  { code: "95", name: "Guaviare", municipios: M("95001 San José del Guaviare") },
  { code: "97", name: "Vaupés", municipios: M("97001 Mitú") },
  { code: "99", name: "Vichada", municipios: M("99001 Puerto Carreño") },
];
for (const d of DIVIPOLA) d.municipios.sort((a, b) => a.name.localeCompare(b.name, "es"));

export const departamento = (code?: string) => DIVIPOLA.find((d) => d.code === code);
export const municipio = (depCode?: string, munCode?: string) => departamento(depCode)?.municipios.find((m) => m.code === munCode);

/** true si el par departamento → municipio existe en el catálogo. */
export const validLocation = (dep?: string, mun?: string) => !!municipio(dep, mun) && String(mun).startsWith(String(dep));

export const locationLabel = (v: { dep?: string; mun?: string } | null | undefined) => {
  if (!v?.dep) return "";
  const d = departamento(v.dep), m = municipio(v.dep, v.mun);
  return [m?.name, d?.name].filter(Boolean).join(", ") + (m ? ` (${m.code})` : "");
};
