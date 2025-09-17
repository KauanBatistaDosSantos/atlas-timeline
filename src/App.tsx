import React, { useMemo, useRef, useEffect, useState } from "react";
import { create } from "zustand";
import { v4 as uuid } from "uuid";
import { Save, Plus, Search, Pin, PinOff, ZoomIn, ZoomOut, Download, Cog, Image as ImageIcon, X, Maximize2, Minimize2, Eye, Expand, Shrink, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Document, Packer, Paragraph, TextRun } from "docx";

// ------------------ Types ------------------
const LEVELS = ["ERA","MILLENNIUM","CENTURY","DECADE","YEAR"] as const;
type Level = typeof LEVELS[number];

type AtlasCalendar = {
  daysOfWeek: string[];
  months: { name: string; days: number }[];
  yearsPerCentury: number;
  centuriesPerMillennium: number;
  decadesPerCentury: number;
};

type AtlasDate = {
  era?: string;
  millennium?: number;
  century?: number;
  decade?: number;
  year?: number;
  month?: number;
  day?: number;
  relativeEra?: "AU" | "DU"; // novo campo
};

type Note = {
  id: string;
  title: string;
  description?: string;
  date: AtlasDate;
  level: Level;
  images?: string[];
  pinned?: boolean;
  weight?: number;
  createdAt: number;
  tags?: string[];
};

type LayoutMode = "ALTERNATE" | "LEFT" | "RIGHT" | "HORIZONTAL";

// ------------------ Colors & Shapes ------------------
const levelStyles: Record<Level, { color: string; marker: (props: any) => JSX.Element; label: string }> = {
  ERA: {
    color: "#22c55e", // green
    marker: ({ size = 14 }: { size?: number }) => (
      <div className="bg-green-500" style={{ width: size, height: size }} />
    ),
    label: "Eras",
  },
  MILLENNIUM: {
    color: "#fb923c", // orange
    marker: ({ size = 16 }: { size?: number }) => (
      <div
        className="relative"
        style={{ width: 0, height: 0, borderLeft: `${size/2}px solid transparent`, borderRight: `${size/2}px solid transparent`, borderBottom: `${size}px solid #fb923c` }}
      />
    ),
    label: "Milênios",
  },
  CENTURY: {
    color: "#facc15", // yellow
    marker: ({ size = 18 }: { size?: number }) => (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rotate-45" style={{ background: "conic-gradient(from 0deg, #facc15 0 12.5%, transparent 12.5% 25%, #facc15 25% 37.5%, transparent 37.5% 50%, #facc15 50% 62.5%, transparent 62.5% 75%, #facc15 75% 87.5%, transparent 87.5% 100%)" }} />
      </div>
    ),
    label: "Séculos",
  },
  DECADE: {
    color: "#a855f7", // purple
    marker: ({ size = 12 }: { size?: number }) => (
      <div className="bg-purple-500" style={{ width: size, height: size, transform: "rotate(45deg)" }} />
    ),
    label: "Décadas",
  },
  YEAR: {
    color: "#3b82f6", // blue
    marker: ({ size = 10 }: { size?: number }) => (
      <div className="rounded-full bg-blue-500" style={{ width: size, height: size }} />
    ),
    label: "Anos",
  },
};

// ------------------ Store ------------------
interface TLState {
  notes: Note[];
  calendar: AtlasCalendar;
  zoom: Level;
  search: string;
  filters: string[];
  addNote: (n: Omit<Note, "id"|"createdAt">) => void;
  togglePin: (id: string) => void;
  updateCalendar: (c: Partial<AtlasCalendar>) => void;
  setZoom: (z: Level) => void;
  setSearch: (q: string) => void;
  setFilters: (f: string[]) => void;
  removeNote: (id: string) => void;
  load: () => void;
  layout: LayoutMode;
  setLayout: (m: LayoutMode) => void;
}

const defaultCalendar: AtlasCalendar = {
  daysOfWeek: ["Dya","Lun","Var","Tyr","Kyr","Saa","Nox"],
  months: [
    { name: "Lume", days: 30 }, { name: "Vera", days: 30 }, { name: "Nara", days: 30 }, { name: "Siri", days: 30 },
    { name: "Dora", days: 30 }, { name: "Mira", days: 30 }, { name: "Kora", days: 30 }, { name: "Tala", days: 30 },
    { name: "Vion", days: 30 }, { name: "Zala", days: 30 }, { name: "Orin", days: 30 }, { name: "Ysar", days: 30 },
  ],
  yearsPerCentury: 100,
  centuriesPerMillennium: 10,
  decadesPerCentury: 10,
};

const useTL = create<TLState>((set, get) => ({
  notes: [],
  calendar: defaultCalendar,
  zoom: "YEAR",
  search: "",
  filters: [],
  layout: "ALTERNATE",
  setLayout: (m) => set({ layout: m }),
  addNote: (n) => set((s) => {
    const newNote: Note = { id: uuid(), createdAt: Date.now(), ...n };
    const notes = [...s.notes, newNote];
    localStorage.setItem("atlas_timeline_notes", JSON.stringify(notes));
    return { notes };
  }),
  togglePin: (id) => set((s) => {
    const notes = s.notes.map((x) => x.id === id ? { ...x, pinned: !x.pinned } : x);
    localStorage.setItem("atlas_timeline_notes", JSON.stringify(notes));
    return { notes };
  }),
  removeNote: (id) => set((s) => {
    const notes = s.notes.filter((x) => x.id !== id);
    localStorage.setItem("atlas_timeline_notes", JSON.stringify(notes));
    return { notes };
  }),
  updateCalendar: (c) => set((s) => {
    const calendar = { ...s.calendar, ...c };
    localStorage.setItem("atlas_timeline_calendar", JSON.stringify(calendar));
    return { calendar };
  }),
  setZoom: (z) => set({ zoom: z }),
  setSearch: (q) => set({ search: q }),
  setFilters: (f) => set({ filters: f }),
  load: () => {
    try {
      let notes = JSON.parse(localStorage.getItem("atlas_timeline_notes") || "[]");
      notes = notes.map((n: Note) => ({
        ...n,
        date: {
          ...n.date,
          relativeEra: n.date.relativeEra || (n.date.year < 0 ? "AU" : "DU"),
        },
      }));
      const calendar = JSON.parse(localStorage.getItem("atlas_timeline_calendar") || "null") || defaultCalendar;
      set({ notes, calendar });
    } catch {}
  },
}));

// ------------------ Filters UI ------------------
function FilterBox(){
  const { filters, setFilters, notes } = useTL();
  const [open, setOpen] = useState(false);
  const allTags = Array.from(new Set(notes.flatMap(n=>n.tags||[])));

  function toggleTag(tag: string){
    if(filters.includes(tag)) setFilters(filters.filter(f=>f!==tag));
    else setFilters([...filters, tag]);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2"><Filter size={16}/>Filtros</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allTags.length ? allTags.map(tag=>(
          <DropdownMenuItem key={tag} onClick={()=>toggleTag(tag)}>
            <span className={filters.includes(tag)?"font-bold text-blue-600":""}>{tag}</span>
          </DropdownMenuItem>
        )): <div className="px-2 py-1 text-xs text-muted-foreground">(sem tags)</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------ Helpers ------------------
function formatAtlasDate(d: AtlasDate, cal: AtlasCalendar, level: Level) {
  const parts: string[] = [];
  if (level === "ERA") {
    if (d.era) parts.push(`${d.era}`);
  } else if (level === "MILLENNIUM") {
    if (d.millennium != null) parts.push(`${d.millennium}º milênio`);
  } else if (level === "CENTURY") {
    if (d.century != null) parts.push(`Século ${d.century} (${toRoman(d.century)})`);
  } else if (level === "DECADE") {
    if (d.decade != null) parts.push(`Década de ${d.decade}`);
  } else if (level === "YEAR") {
    if (d.year != null) {
      // Apenas anos antes da união exibem sufixo a.U.
      const suffix = d.relativeEra === "AU" ? " a.U." : "";
      parts.push(`${d.year}${suffix}`);
    }
  }
  return parts.join(" • ");
}

function toRoman(num:number): string {
  if(num <= 0) return String(num);
  const romans: [number,string][] = [
    [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]
  ];
  let result = "";
  for(const [val, sym] of romans){
    while(num >= val){
      result += sym;
      num -= val;
    }
  }
  return result;
}

function ImagePreview({ src, alt }:{ src:string, alt?:string }){
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt || "imagem"}
        className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80 transition"
        onClick={()=>setOpen(true)}
      />
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl bg-black p-2">
            <img src={src} alt={alt || "imagem"} className="max-h-[80vh] w-auto mx-auto object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ------------------ Components ------------------
function Toolbar() {
  const { zoom, setZoom, setSearch, notes, layout, setLayout } = useTL();
  const [query, setQuery] = useState("");

  const pinnedCount = notes.filter(n => n.pinned).length;

  return (
    <div className="sticky top-0 z-50 backdrop-blur bg-background/70 border-b w-full">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-2 p-2">
        <h1 className="text-3xl font-extrabold text-center tracking-wide mb-2 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500 bg-clip-text text-transparent">
          Linha do Tempo de Atlas
        </h1>

        <div className="w-full flex flex-wrap items-center gap-2 justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2"><ZoomOut size={16}/>Zoom: {zoom}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LEVELS.map(l => (
                <DropdownMenuItem key={l} onClick={() => setZoom(l as Level)}>{l}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Cog size={16}/> Layout: {layout === "ALTERNATE" ? "Alternado" : layout === "LEFT" ? "Esquerda" : layout === "RIGHT" ? "Direita" : "Horizontal"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLayout("ALTERNATE")}>Alternado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout("LEFT")}>Tudo à esquerda</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout("RIGHT")}>Tudo à direita</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout("HORIZONTAL")}>Horizontal</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <SearchBox value={query} onChange={setQuery} onSearch={() => setSearch(query)} />

          <FilterBox />

          <AddNoteDialog />

          <SettingsDialog />

          <Button
            variant="outline"
            onClick={() => {
              const notes = JSON.parse(localStorage.getItem("atlas_timeline_notes") || "[]");
              downloadJSON("timeline.json", notes);
            }}
          >
            Exportar JSON
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "application/json";
              input.onchange = (e: any) => importJSON(e);
              input.click();
            }}
          >
            Importar JSON
          </Button>

          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Tem certeza que deseja apagar toda a timeline? Essa ação não pode ser desfeita.")) {
                localStorage.removeItem("atlas_timeline_notes");
                window.location.reload(); // recarrega a página para aplicar
              }
            }}
          >
            Zerar Timeline
          </Button>

          <ExportMenu />

          <div className="text-xs text-muted-foreground px-2 ml-auto">Fixadas: {pinnedCount}</div>
        </div>
      </div>
    </div>
  );
}

function SearchBox({ value, onChange, onSearch }:{ value:string, onChange:(v:string)=>void, onSearch:()=>void }){
  return (
    <div className="flex items-center gap-1">
      <Input placeholder="Pesquisar palavra, ano, milênio..." value={value} onChange={e=>onChange(e.target.value)} className="w-64"/>
      <Button variant="outline" onClick={onSearch}><Search size={16}/></Button>
    </div>
  );
}

// ===== EXPORTAÇÃO =====
type GroupLevel = "NONE" | "ERA" | "MILLENNIUM" | "CENTURY" | "DECADE";

type ExportOptions = {
  includeDescription?: boolean; // padrão: true
  includeTags?: boolean;        // padrão: false
  includeImages?: boolean;      // (não usado em TXT/DOCX — mantido p/ futuro)
  groupBy: GroupLevel;          // padrão: "NONE"
};

function buildExportText(notes: Note[], calendar: AtlasCalendar, opts: ExportOptions): string {
  const order = [...notes].sort(compareDates);

  const formatNote = (n: Note) => {
    // 1) Data (sem "Ano"), com "a.U." somente quando AU
    const lines: string[] = [formatAtlasDate(n.date, calendar, "YEAR")];

    // 2) Título
    if (n.title) lines.push(n.title);

    // 3) Descrição (se habilitado)
    if (opts.includeDescription !== false && n.description) lines.push(n.description);

    // 4) Tags (opcional)
    if (opts.includeTags && n.tags?.length) lines.push("Tags: " + n.tags.join(", "));

    return lines.join("\n");
  };

  if (opts.groupBy === "NONE") {
    return order.map(formatNote).join("\n\n");
  }

  // Agrupamento por nível escolhido
  const keyOf = (n: Note): string => {
    switch (opts.groupBy) {
      case "ERA":        return n.date.era || "Sem Era";
      case "MILLENNIUM": return formatAtlasDate(n.date, calendar, "MILLENNIUM") || "Milênio ?";
      case "CENTURY":    return formatAtlasDate(n.date, calendar, "CENTURY") || "Século ?";
      case "DECADE":     return formatAtlasDate(n.date, calendar, "DECADE") || "Década ?";
    }
  };

  const groups = new Map<string, Note[]>();
  for (const n of order) {
    const k = keyOf(n);
    groups.set(k, [...(groups.get(k) || []), n]);
  }

  return Array.from(groups.entries())
    .map(([k, arr]) => `${k}\n` + arr.map(formatNote).join("\n\n"))
    .join("\n\n");
}

function saveTXT(
  filename: string,
  notes: Note[],
  calendar: AtlasCalendar,
  opts: ExportOptions
) {
  const text = buildExportText(notes, calendar, opts);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function saveDOCX(
  filename: string,
  notes: Note[],
  calendar: AtlasCalendar,
  opts: ExportOptions
) {
  const text = buildExportText(notes, calendar, opts);
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: text.split("\n").map(line => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadJSON(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      localStorage.setItem("atlas_timeline_notes", JSON.stringify(data));
      window.location.reload(); // recarrega o app para aplicar
    } catch (err) {
      alert("Arquivo inválido");
    }
  };
  reader.readAsText(file);
}

function ExportMenu(){
  const { notes, calendar } = useTL();
  const [open, setOpen] = useState(false);

  // Opções com os padrões que você pediu
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeTags, setIncludeTags] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupLevel>("NONE");

  const opts: ExportOptions = {
    includeDescription,
    includeTags,
    includeImages: false,
    groupBy,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Download size={16}/> Exportar
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[520px]">
        <DialogHeader>
          <DialogTitle>Exportar timeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="font-medium mb-1">Formato padrão de cada nota:</div>
            <pre className="rounded bg-muted p-3 whitespace-pre leading-5 text-xs">
{`4 a.U.
Título
Descrição`}
            </pre>
            <div className="text-xs text-muted-foreground">
              (Data • Título • Descrição; “a.U.” aparece só para anos antes da união)
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeDescription}
                onChange={(e)=>setIncludeDescription(e.target.checked)}
              />
              Incluir descrição
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeTags}
                onChange={(e)=>setIncludeTags(e.target.checked)}
              />
              Incluir tags
            </label>
          </div>

          <div>
            <div className="font-medium mb-1">Agrupar por:</div>
            <select
              className="w-full border rounded p-2"
              value={groupBy}
              onChange={(e)=>setGroupBy(e.target.value as GroupLevel)}
            >
              <option value="NONE">Sem agrupamento</option>
              <option value="ERA">Era</option>
              <option value="MILLENNIUM">Milênio</option>
              <option value="CENTURY">Século</option>
              <option value="DECADE">Década</option>
            </select>
            <div className="text-xs text-muted-foreground mt-1">
              (Se escolher um agrupamento, o nome do grupo aparece como cabeçalho antes das notas)
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => saveTXT("atlas_timeline.txt", notes, calendar, opts)}
            >
              TXT
            </Button>
            <Button
              onClick={() => saveDOCX("atlas_timeline.docx", notes, calendar, opts)}
            >
              DOCX
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddNoteDialog(){
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("YEAR");
  const [date, setDate] = useState<AtlasDate>({});
  const [images, setImages] = useState<string[]>([]);
  const [weight, setWeight] = useState<number>(1);
  const [tags, setTags] = useState<string>(""); // NOVO
  const { addNote } = useTL();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>){
    const files = e.target.files; if(!files) return;
    Array.from(files).forEach(file=>{
      const reader = new FileReader();
      reader.onload = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    })
  }

  function save(){
    const tagsArr = tags.split(",").map(t=>t.trim()).filter(Boolean);
    addNote({ title, description, level, date, images, weight, pinned: false, tags: tagsArr });
    setOpen(false);
    setTitle(""); setDescription(""); setDate({}); setImages([]); setWeight(1); setLevel("YEAR"); setTags("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="flex items-center gap-2"><Plus size={16}/>Adicionar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova nota / acontecimento</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Input placeholder="Título" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Textarea placeholder="Descrição (opcional)" value={description} onChange={e=>setDescription(e.target.value)} />
          </div>
          
          {/* Campo de Tags */}
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Tags (separadas por vírgula)</label>
            <Input placeholder="Ex: Humanos, Guerra, Religião" value={tags} onChange={e=>setTags(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Granularidade</label>
            <select value={level} onChange={e=>setLevel(e.target.value as Level)} className="w-full border rounded p-2">
              {LEVELS.map(l=> <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs text-muted-foreground">Peso</label>
            <Input type="number" value={weight} onChange={e=>setWeight(Number(e.target.value)||1)} className="w-24" />
            <span className="text-xs text-muted-foreground">(define tamanho/intensidade do marcador)</span>
          </div>

          <DateEditor date={date} onChange={setDate} />

          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Imagens (opcional)</label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="image/*" multiple onChange={handleFile} />
            </div>
            {!!images.length && (
              <div className="mt-2 grid grid-cols-6 gap-2">
                {images.map((src,i)=> (
                  <div key={i} className="relative">
                    <img src={src} className="w-full h-16 object-cover rounded"/>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!title.trim()}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DateEditor({ date, onChange }:{ date: AtlasDate, onChange:(d:AtlasDate)=>void }){
  const { calendar, notes } = useTL();
  const update = (k:keyof AtlasDate, v:any) => onChange({ ...date, [k]: v });

  const eras = Array.from(new Set(notes.map(n=>n.date.era).filter(Boolean))) as string[];
  const millennia = Array.from(new Set(notes.map(n=>n.date.millennium).filter(v=>v!=null))) as number[];
  const centuries = Array.from(new Set(notes.map(n=>n.date.century).filter(v=>v!=null))) as number[];
  const decades = Array.from(new Set(notes.map(n=>n.date.decade).filter(v=>v!=null))) as number[];

  return (
    <div className="col-span-2 grid grid-cols-6 gap-3">
      <div className="col-span-6">
        <label className="text-xs font-semibold text-purple-600">Era</label>
        <input list="eras-list" value={date.era ?? ""} onChange={e=>update("era", e.target.value)} placeholder="Ex.: Era de Ouro" className="w-full border rounded p-2 bg-gradient-to-r from-green-50 to-green-100 focus:outline-none focus:ring-2 focus:ring-green-400" />
        <datalist id="eras-list">
          {eras.map((era,i)=> <option key={i} value={era} />)}
        </datalist>
      </div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-orange-600">Milênio</label>
        <input
          list="millennia-list"
          type="number"
          value={date.millennium ?? ""}
          onChange={e=>update("millennium", e.target.value===''?undefined:Number(e.target.value))}
          className="w-full border rounded p-2 bg-gradient-to-r from-orange-50 to-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <datalist id="millennia-list">
          {millennia.map((m,i)=> <option key={i} value={m} />)}
        </datalist>
      </div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-yellow-600">Século</label>
        <input
          list="centuries-list"
          type="number"
          value={date.century ?? ""}
          onChange={e=>update("century", e.target.value===''?undefined:Number(e.target.value))}
          className="w-full border rounded p-2 bg-gradient-to-r from-yellow-50 to-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <datalist id="centuries-list">
          {centuries.map((c,i)=> <option key={i} value={c} />)}
        </datalist>
      </div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-purple-600">Década</label>
        <input
          list="decades-list"
          type="number"
          value={date.decade ?? ""}
          onChange={e=>update("decade", e.target.value===''?undefined:Number(e.target.value))}
          className="w-full border rounded p-2 bg-gradient-to-r from-purple-50 to-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
        <datalist id="decades-list">
          {decades.map((d,i)=> <option key={i} value={d} />)}
        </datalist>
      </div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-blue-600">Ano</label>
        <input type="number" value={date.year !== undefined ? String(date.year) : ""} onChange={e=>update("year", e.target.value===''?undefined:Number(e.target.value))} className="w-full border rounded p-2 bg-gradient-to-r from-blue-50 to-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div className="col-span-2">
  <label className="text-xs font-semibold text-red-600">Referência</label>
  <select
    value={date.relativeEra ?? "DU"}
    onChange={e=>update("relativeEra", e.target.value as "AU" | "DU")}
    className="w-full border rounded p-2 bg-gradient-to-r from-red-50 to-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
  >
    <option value="DU">Depois da União (DU)</option>
    <option value="AU">Antes da União (AU)</option>
  </select>
</div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-indigo-600">Mês</label>
        <select className="w-full border rounded p-2 bg-gradient-to-r from-indigo-50 to-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={date.month ?? ''} onChange={e=>update("month", e.target.value===''?undefined:Number(e.target.value))}>
          <option value="">—</option>
          {calendar.months.map((m, idx)=> <option key={idx} value={idx+1}>{idx+1} - {m.name}</option>)}
        </select>
      </div>
      <div className="col-span-2">
        <label className="text-xs font-semibold text-pink-600">Dia</label>
        <input type="number" value={date.day !== undefined ? String(date.day) : ""} onChange={e=>update("day", e.target.value===''?undefined:Number(e.target.value))} className="w-full border rounded p-2 bg-gradient-to-r from-pink-50 to-pink-100 focus:outline-none focus:ring-2 focus:ring-pink-400" />
      </div>
    </div>
  );
}

function SettingsDialog(){
  const { calendar, updateCalendar } = useTL();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(calendar.daysOfWeek.join(", "));
  const [months, setMonths] = useState(calendar.months.map(m=>`${m.name}:${m.days}`).join(", "));
  const [ypc, setYpc] = useState(calendar.yearsPerCentury);
  const [cpm, setCpm] = useState(calendar.centuriesPerMillennium);
  const [dpc, setDpc] = useState(calendar.decadesPerCentury);

  function save(){
    const daysOfWeek = days.split(",").map(s=>s.trim()).filter(Boolean);
    const monthsSpec = months.split(",").map(s=>s.trim()).filter(Boolean).map(pair=>{
      const [name, days] = pair.split(":").map(x=>x.trim());
      return { name, days: Number(days)||30 };
    });
    updateCalendar({ daysOfWeek, months: monthsSpec, yearsPerCentury: ypc, centuriesPerMillennium: cpm, decadesPerCentury: dpc });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2"><Cog size={16}/>Calendário</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personalizar Calendário de Atlas</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Dias da semana (separados por vírgula)</label>
            <Input value={days} onChange={e=>setDays(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Meses (formato Nome:Dias, separados por vírgula)</label>
            <Input value={months} onChange={e=>setMonths(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Anos por século</label>
              <Input type="number" value={ypc} onChange={e=>setYpc(Number(e.target.value)||100)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Séculos por milênio</label>
              <Input type="number" value={cpm} onChange={e=>setCpm(Number(e.target.value)||10)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Décadas por século</label>
              <Input type="number" value={dpc} onChange={e=>setDpc(Number(e.target.value)||10)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function compareDates(a: Note, b: Note) {
  const getNumericYear = (n: Note) => {
    if (!n.date.year) return 0;
    if (n.date.relativeEra === "AU") {
      // antes da União → trata como negativo
      return -n.date.year;
    }
    return n.date.year;
  };

  return getNumericYear(a) - getNumericYear(b);
}


// ------------------ Filtering integration ------------------
function useGroupedNotes(){
  const { notes, zoom, search, filters } = useTL();
  return useMemo(()=>{
    let filtered = notes;
    if(search.trim()){
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        (n.description||"").toLowerCase().includes(search.toLowerCase())
      );
    }
    if(filters.length){
      filtered = filtered.filter(n=> (n.tags||[]).some(t=>filters.includes(t)));
    }

    function buildKey(n: Note, level: Level){
      const d = n.date;
      if(level === "ERA")        return `${d.era||"(Sem Era)"}`;
      if(level === "MILLENNIUM") return `${d.era||"?"}::${d.millennium??"?"}`;
      if(level === "CENTURY")    return `${d.era||"?"}::${d.millennium??"?"}::${d.century??"?"}`;
      if(level === "DECADE")     return `${d.era||"?"}::${d.millennium??"?"}::${d.century??"?"}::${d.decade??"?"}`;
      return `${d.era||"?"}::${d.millennium??"?"}::${d.century??"?"}::${d.decade??"?"}::${d.year??"?"}`;
    }

    const groups = new Map<string, Note[]>();
    for(const n of filtered){
      let key: string;
      if(zoom === "ERA")         key = buildKey(n, "ERA");
      else if(zoom === "MILLENNIUM") key = buildKey(n, "MILLENNIUM");
      else if(zoom === "CENTURY")    key = buildKey(n, "CENTURY");
      else if(zoom === "DECADE")     key = buildKey(n, "CENTURY");
      else                            key = buildKey(n, "YEAR");
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }

    const entries = Array.from(groups.entries()).sort((a,b)=>{
      const firstA = a[1][0];
      const firstB = b[1][0];
      return compareDates(firstA, firstB);
    });

    return entries.map(([key, items])=> ({ key, items: items.sort(compareDates) }));
  }, [notes, zoom, search, filters]);
}

function Timeline(){
  const { calendar, zoom, load, layout } = useTL();
  const groups = useGroupedNotes();
  useEffect(()=>{ load(); }, []);

  const grad = "linear-gradient(to bottom, #22c55e, #fb923c, #facc15, #a855f7, #3b82f6)";

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6 py-6">
      {/* Legend */}
      <div className="col-span-12">
        <Card>
          <CardContent className="py-3">
            <div className="flex justify-center items-center gap-6 text-sm">
              {LEVELS.map(l => (
                <div key={l} className="flex items-center gap-2">
                  {levelStyles[l].marker({ size: 14 })}
                  <span>{levelStyles[l].label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linha + grupos (vertical ou horizontal) */}
      {layout === "HORIZONTAL" ? (
        <div className="col-span-12">
          <HorizontalTimeline groups={groups} level={zoom} />
        </div>
      ) : (
        <div className="col-span-12 relative min-h-[70vh]">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-2 rounded-full" style={{ background: grad }} />
          <div className="relative">
            {groups.map((g, i) => (
              <GroupRow2 key={g.key} index={i} items={g.items} level={zoom} layout={layout} />
            ))}
          </div>
        </div>
      )}

      {/* Pinned */}
      <PinnedPanel />
    </div>
  );
}

// ---------- Componentes novos: agrupadores hierárquicos ----------
function NestedGroups({ rootLevel, items }:{ rootLevel: Level, items: Note[] }){
  const { calendar } = useTL();
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const toggle = (k:string)=> setOpenMap(s=>({ ...s, [k]: !s[k] }));

  const chainMap: Record<Level, Level[]> = {
    ERA:        ["MILLENNIUM","CENTURY","DECADE","YEAR"],
    MILLENNIUM: ["CENTURY","DECADE","YEAR"],
    CENTURY:    ["DECADE","YEAR"],
    DECADE:     ["DECADE","YEAR"],
    YEAR:       [],
  };
  const chain = chainMap[rootLevel];

  function groupByLevel(list: Note[], lvl: Level){
    const map = new Map<string, Note[]>();
    for(const n of list){
      let key: string;
      if(lvl === "MILLENNIUM") key = String(n.date.millennium ?? "?");
      else if(lvl === "CENTURY") key = String(n.date.century ?? "?");
      else if(lvl === "DECADE") key = String(n.date.decade ?? "?");
      else key = String(n.date.year ?? "?");
      if(!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    const entries = Array.from(map.entries()).sort((a,b)=> compareDates(a[1][0], b[1][0]));
    return entries.map(([k, arr])=> ({ key: k, notes: arr }));
  }

  function renderLevel(levels: Level[], subset: Note[]): JSX.Element {
    if (levels.length === 0) {
      return <AggregatedNotes items={subset}/>;
    }

    const lvl = levels[0];
    const groups = groupByLevel(subset, lvl);
    return (
      <div className="space-y-2">
        {groups.map(g=>{
          const sample = g.notes[0];
          const label = formatAtlasDate(sample.date, calendar, lvl);
          const k = `${lvl}:${g.key}:${sample.date.century ?? "?"}:${sample.date.millennium ?? "?"}:${sample.date.era ?? "?"}`;
          const opened = openMap[k] ?? false;

          // Definindo cor do nível
          const levelColor = levelStyles[lvl].color;

          return (
            <Card key={k} className="w-full border-2" style={{ borderColor: levelColor+"80", background: levelColor+"0d" }}>
              <CardHeader className="py-3 cursor-pointer" onClick={()=>toggle(k)}>
                <div className="flex items-center justify-center w-full relative">
                  <CardTitle className="text-sm text-center">{label}</CardTitle>
                  <div className="absolute right-0">
                    <Button size="icon" variant="ghost">{opened ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</Button>
                  </div>
                </div>
              </CardHeader>
              {opened && (
                <CardContent>
                  {levels.length > 1 ? (
                    renderLevel(levels.slice(1), g.notes)
                  ) : (
                    <AggregatedNotes items={g.notes} />
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  }

  if(!chain || !chain.length) return <AggregatedNotes items={items}/>;
  return renderLevel(chain, items);
}

function GroupRow2(
  { index, items, level, layout }:
  { index:number, items: Note[], level: Level, layout: LayoutMode }
){
  const { calendar } = useTL();
  const totalWeight = items.reduce((s, n) => s + (n.weight||1), 0);
  const size = Math.min(42, 8 + totalWeight * 4);
  const [open, setOpen] = useState(false);

  // Cabeçalho: no zoom DECADE, mostramos o SÉCULO; nos demais, o próprio zoom
  const headerLevel: Level = (level === "DECADE") ? "CENTURY" : level;
  const sample = items[0];
  const label = formatAtlasDate(sample.date, calendar, headerLevel);

  // Decide lado de acordo com o layout
  const align =
    layout === "LEFT" ? "LEFT" :
    layout === "RIGHT" ? "RIGHT" :
    (index % 2 === 0 ? "RIGHT" : "LEFT"); // alternado
  const alignRight = align === "RIGHT";

  return (
    <div className="relative flex items-center py-3">
      {/* Caixa do evento */}
      {alignRight ? <div className="w-1/2"/> : (
        <div className="w-1/2 pr-6 flex justify-end">
          <Card className="w-full max-w-md">
            <CardHeader className="py-3 cursor-pointer" onClick={()=>setOpen(o=>!o)}>
              <div className="flex items-center justify-center w-full relative">
                <CardTitle className="text-base text-center">{label || "(período)"}</CardTitle>
                <div className="absolute right-0">
                  <Button size="icon" variant="ghost">
                    {open ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {open && (
              <CardContent>
                <NestedGroups rootLevel={level} items={items} />
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* Linha central */}
      <div className="relative w-0">
        <div className="absolute left-1/2 -translate-x-1/2">
          <div className="flex items-center justify-center" style={{ width: size, height: size }}>
            <div className="drop-shadow" style={{ filter: "brightness(1.05)" }}>
              {levelStyles[level].marker({ size })}
            </div>
          </div>
        </div>
      </div>

      {alignRight ? (
        <div className="w-1/2 pl-6 flex justify-start">
          <Card className="w-full max-w-md">
            <CardHeader className="py-3 cursor-pointer" onClick={()=>setOpen(o=>!o)}>
              <div className="flex items-center justify-center w-full relative">
                <CardTitle className="text-base text-center">{label || "(período)"}</CardTitle>
                <div className="absolute right-0">
                  <Button size="icon" variant="ghost">
                    {open ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {open && (
              <CardContent>
                <NestedGroups rootLevel={level} items={items} />
              </CardContent>
            )}
          </Card>
        </div>
      ) : <div className="w-1/2"/>}
    </div>
  );
}

function HorizontalTimeline({
  groups,
  level
}:{
  groups: { key:string; items: Note[] }[];
  level: Level;
}){
  const grad = "linear-gradient(to right, #22c55e, #fb923c, #facc15, #a855f7, #3b82f6)";
  return (
    <div className="relative py-10">
      {/* linha horizontal */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full" style={{ background: grad }} />

      <div className="flex gap-6 overflow-x-auto pb-8">
        {groups.map((g, i) => (
          <HorizontalItem key={g.key} index={i} items={g.items} level={level} />
        ))}
      </div>
    </div>
  );
}

function HorizontalItem({ index, items, level }:{
  index:number; items:Note[]; level:Level;
}){
  const { calendar } = useTL();
  const [open, setOpen] = useState(false);
  const headerLevel: Level = (level === "DECADE") ? "CENTURY" : level;
  const label = formatAtlasDate(items[0].date, calendar, headerLevel);
  const up = index % 2 === 0; // alterna acima/abaixo da linha

  return (
    <div className={`relative min-w-[320px] ${up ? "pb-12" : "pt-12"}`}>
      <div className={`absolute left-1/2 -translate-x-1/2 ${up ? "bottom-0" : "top-0"}`}>
        {levelStyles[level].marker({ size: 22 })}
      </div>
      <Card className="w-[320px]">
        <CardHeader className="py-3 cursor-pointer" onClick={()=>setOpen(o=>!o)}>
          <div className="flex items-center justify-center w-full relative">
            <CardTitle className="text-base text-center">{label || "(período)"}</CardTitle>
            <div className="absolute right-0">
              <Button size="icon" variant="ghost">
                {open ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
              </Button>
            </div>
          </div>
        </CardHeader>
        {open && (
          <CardContent>
            <NestedGroups rootLevel={level} items={items}/>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function AggregatedNotes({ items }:{ items: Note[] }){
  const { calendar, togglePin, removeNote, notes } = useTL();
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [editingNote, setEditingNote] = useState<Note|null>(null);
  const [viewingNote, setViewingNote] = useState<Note|null>(null);
  const [editTags, setEditTags] = useState<string>("");

  function saveEdit(){
    if(editingNote){
      const normalizedDate: AtlasDate = {
        era: editingNote.date.era ?? "",
        millennium: editingNote.date.millennium ?? undefined,
        century: editingNote.date.century ?? undefined,
        decade: editingNote.date.decade ?? undefined,
        year: editingNote.date.year ?? undefined,
        month: editingNote.date.month ?? undefined,
        day: editingNote.date.day ?? undefined,
        relativeEra: editingNote.date.relativeEra ?? "DU"
      };

      const updated = { ...editingNote, date: normalizedDate, tags: editTags.split(",").map(t=>t.trim()).filter(Boolean) };
      const updatedNotes = notes.map(n => n.id === updated.id ? updated : n);
      localStorage.setItem("atlas_timeline_notes", JSON.stringify(updatedNotes));
      window.dispatchEvent(new Event("storage"));
      setEditingNote(null);
      setEditTags("");

      window.location.reload();  
    }
  }

  const byYear = useMemo(() => {
    // Se já estamos no zoom YEAR, retorna as notas diretamente
    if (items.length && items[0].level === "YEAR") {
      return [["direct", items]] as [string, Note[]][];
    }

    const m = new Map<string, Note[]>();
    for (const n of items) {
      const k = `${n.date.relativeEra ?? "DU"}::${n.date.year ?? "?"}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return Array.from(m.entries()).sort((a, b) => compareDates(a[1][0], b[1][0]));
  }, [items]);

  return (
    <div className="space-y-2">
      {byYear.map(([year, notes]) => (
        <div key={year} className="border rounded-xl p-2">
          {year === "direct" ? (
            // Renderização direta no nível de YEAR
            <div className="mt-2 grid gap-2">
              {notes.sort((a,b)=> (a.weight||1)-(b.weight||1)).map(n => (
                <div key={n.id} className="rounded-lg border p-2">
                  {editingNote?.id === n.id ? (
                    <div className="space-y-2">
                      <Input value={editingNote.title} onChange={e=>setEditingNote({...editingNote, title:e.target.value})} />
                      <Textarea value={editingNote.description} onChange={e=>setEditingNote({...editingNote, description:e.target.value})} />

                      {/* Granularidade */}
                      <div>
                        <label className="text-xs text-muted-foreground">Granularidade</label>
                        <select value={editingNote.level} onChange={e=>setEditingNote({...editingNote, level:e.target.value as Level})} className="w-full border rounded p-2">
                          {LEVELS.map(l=> <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>

                      {/* Peso */}
                      <div>
                        <label className="text-xs text-muted-foreground">Peso</label>
                        <Input type="number" value={editingNote.weight||1} onChange={e=>setEditingNote({...editingNote, weight:Number(e.target.value)||1})} />
                      </div>

                      {/* Datas */}
                      <DateEditor date={editingNote.date} onChange={(d)=>setEditingNote({...editingNote, date:d})} />

                      {/* Tags */}
                      <div>
                        <label className="text-xs text-muted-foreground">Tags (separadas por vírgula)</label>
                        <Input
                          value={editTags}
                          onChange={e => setEditTags(e.target.value)}
                          placeholder="Ex: Humanos, Guerra, Religião"
                        />
                      </div>

                      {/* Imagens */}
                      <div>
                        <label className="text-xs text-muted-foreground">Imagens</label>
                        <Input type="file" accept="image/*" multiple onChange={(e)=>{
                          const files = e.target.files; if(!files) return;
                          Array.from(files).forEach(file=>{
                            const reader = new FileReader();
                            reader.onload = () => {
                              setEditingNote(prev => prev ? {...prev, images:[...(prev.images||[]), reader.result as string]} : prev);
                            };
                            reader.readAsDataURL(file);
                          });
                        }} />
                        {!!(editingNote.images && editingNote.images.length) && (
                          <div className="mt-2 grid grid-cols-4 gap-2">
                            {editingNote.images.map((src,i)=> (
                              <ImagePreview key={i} src={src} />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={()=>setEditingNote(null)}>Cancelar</Button>
                        <Button onClick={saveEdit}>Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{n.title}</div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={()=>togglePin(n.id)} title={n.pinned?"Desafixar":"Fixar"}>
                            {n.pinned ? <PinOff size={16}/> : <Pin size={16}/>} 
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={()=>{
                              setEditingNote(n);
                              setEditTags((n.tags || []).join(", "));
                            }}
                            title="Editar"
                          >
                            <Save size={16}/>
                          </Button>
                          <Button size="icon" variant="ghost" onClick={()=>removeNote(n.id)} title="Excluir"><X size={16}/></Button>
                          <Button size="icon" variant="ghost" onClick={()=>setViewingNote(n)} title="Ver detalhes"><Eye size={16}/></Button>
                        </div>
                      </div>
                      {n.description && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.description}</div>}
                      {!!(n.images && n.images.length) && (
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {n.images!.map((src,i)=> <ImagePreview key={i} src={src} />)}
                        </div>
                      )}
                      <div className="text-xs mt-2 text-muted-foreground">{formatAtlasDate(n.date, calendar, n.level)}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Renderização normal (agrupada por ano)
            <>
              <div className="flex items-center justify-center relative cursor-pointer" onClick={()=>setExpandedYears(s=>({ ...s, [year]: !s[year] }))}>
                <div className="font-medium text-center w-full">
                  {formatAtlasDate(notes[0].date, calendar, "YEAR")}
                </div>
                <div className="absolute right-0">
                  <Button size="sm" variant="ghost">{expandedYears[year] ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</Button>
                </div>
              </div>
              {expandedYears[year] && (
                <div className="mt-2 grid gap-2">
                  {notes.sort((a,b)=> (a.weight||1)-(b.weight||1)).map(n => (
                    <div key={n.id} className="rounded-lg border p-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{n.title}</div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={()=>togglePin(n.id)} title={n.pinned?"Desafixar":"Fixar"}>
                            {n.pinned ? <PinOff size={16}/> : <Pin size={16}/>} 
                          </Button>
                          <Button size="icon" variant="ghost" onClick={()=>{ setEditingNote(n); setEditTags((n.tags || []).join(", ")); }} title="Editar"><Save size={16}/></Button>
                          <Button size="icon" variant="ghost" onClick={()=>removeNote(n.id)} title="Excluir"><X size={16}/></Button>
                          <Button size="icon" variant="ghost" onClick={()=>setViewingNote(n)} title="Ver detalhes"><Eye size={16}/></Button>
                        </div>
                      </div>
                      {n.description && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.description}</div>}
                      {!!(n.images && n.images.length) && (
                        <div className="mt-2 grid grid-cols-4 gap-2">
                          {n.images!.map((src,i)=> <ImagePreview key={i} src={src} />)}
                        </div>
                      )}
                      <div className="text-xs mt-2 text-muted-foreground">{formatAtlasDate(n.date, calendar, n.level)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Dialog de detalhes */}
      {viewingNote && (
        <Dialog open={!!viewingNote} onOpenChange={()=>setViewingNote(null)}>
          <DialogContent className="max-w-3xl bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-3xl font-extrabold bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                {viewingNote.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              {viewingNote.description && (
                <div className="text-lg leading-relaxed text-gray-200 bg-gray-800/60 p-4 rounded-lg border border-gray-700 shadow-inner">
                  {viewingNote.description}
                </div>
              )}
              {!!(viewingNote.images && viewingNote.images.length) && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  {viewingNote.images.map((src,i)=>(
                    <img key={i} src={src} className="w-full h-40 object-cover rounded-lg shadow-lg border border-gray-600"/>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">Linha do tempo</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  {viewingNote.date.era && <span className="px-3 py-1 rounded-full bg-gradient-to-r from-green-400 to-emerald-600 text-white font-semibold shadow-md">{viewingNote.date.era}</span>}
                  {viewingNote.date.millennium!=null && <span className="px-3 py-1 rounded-full bg-gradient-to-r from-orange-400 to-red-500 text-white shadow-md">{viewingNote.date.millennium}º milênio</span>}
                  {viewingNote.date.century!=null && (
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-600 text-gray-900 font-semibold shadow-md">
                      Século {viewingNote.date.century} ({toRoman(viewingNote.date.century)})
                    </span>
                  )}
                  {viewingNote.date.decade!=null && (
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-400 to-fuchsia-600 text-white shadow-md">
                      Década de {viewingNote.date.decade}
                    </span>
                  )}
                  {viewingNote.date.year!=null && <span className="px-3 py-1 rounded-full bg-gradient-to-r from-blue-400 to-indigo-600 text-white shadow-md">Ano {viewingNote.date.year}</span>}
                  {(viewingNote.date.month!=null || viewingNote.date.day!=null) && (
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-pink-400 to-rose-600 text-white shadow-md">
                      {viewingNote.date.day ? `${viewingNote.date.day}` : "Dia ?"} de {calendar.months[viewingNote.date.month!-1]?.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  {viewingNote.tags && viewingNote.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {viewingNote.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <Button onClick={()=>setViewingNote(null)} className="bg-gray-700 text-white hover:bg-gray-600">Fechar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PinnedPanel(){
  const { notes, calendar, togglePin } = useTL();
  const pinned = notes.filter(n=>n.pinned);
  if(!pinned.length) return null;
  return (
    <div className="col-span-12">
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Notas fixadas (para analisar períodos)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {pinned.map(n => (
              <div key={n.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{n.title}</div>
                  <Button size="icon" variant="ghost" onClick={()=>togglePin(n.id)} title="Desafixar"><PinOff size={16}/></Button>
                </div>
                {n.description && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{n.description}</div>}
                {!!(n.images && n.images.length) && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {n.images!.map((src,i)=> <img key={i} src={src} className="w-full h-24 object-cover rounded"/>) }
                  </div>
                )}
                <div className="text-xs mt-2 text-muted-foreground">{formatAtlasDate(n.date, calendar, n.level)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function App(){
  return (
    <div className="min-h-screen">
      <Toolbar />
      <Timeline />
    </div>
  );
}
