"use client";

import { useEffect, useRef, useState, type PointerEvent, type FormEvent, type ReactNode } from "react";
import { cachedFetch } from "@/lib/cachedFetch";
import styles from "./draw-view.module.css";

interface Folder {
    id: number;
    name: string;
}

interface Todo {
    id: number;
    titulo: string;
}

type DrawTool = "select" | "path" | "eraser" | "text" | "rect" | "roundRect" | "circle" | "arrow";
type Point = [number, number];

interface ShapeStyle {
    id: string;
    color: string;
    strokeWidth: number;
}

interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

type DrawingElement =
    | (ShapeStyle & { type: "path"; points: Point[] })
    | ({ id: string; color: string } & { type: "text"; x: number; y: number; text: string; fontSize: number })
    | (ShapeStyle & { type: "rect"; x: number; y: number; width: number; height: number })
    | (ShapeStyle & { type: "roundRect"; x: number; y: number; width: number; height: number })
    | (ShapeStyle & { type: "circle"; x: number; y: number; radius: number })
    | (ShapeStyle & { type: "arrow"; x1: number; y1: number; x2: number; y2: number });

interface Drawing {
    id: number;
    titulo: string;
    folder: number | null;
    folder_name: string | null;
    drawing: DrawingElement[];
    updated_at: string;
}

interface DrawingLink {
    id: number;
    drawing: number;
    todo: number;
    todo_titulo: string;
}

interface Paginated<T> {
    results: T[];
    next: string | null;
}

interface Props {
    folders: Folder[];
    folderFilter?: number | null;
    focusDrawingId?: number | null;
}

const WIDTH = 1000;
const HEIGHT = 650;
const TOOLS: { id: DrawTool; label: string; icon: string }[] = [
    { id: "select", label: "Selecionar e mover", icon: "mouse pointer" },
    { id: "path", label: "Desenho livre", icon: "pencil alternate" },
    { id: "eraser", label: "Borracha (apagar traços)", icon: "eraser" },
    { id: "text", label: "Texto", icon: "font" },
    { id: "rect", label: "Retângulo", icon: "square outline" },
    { id: "roundRect", label: "Retângulo arredondado", icon: "square" },
    { id: "circle", label: "Círculo", icon: "circle outline" },
    { id: "arrow", label: "Seta", icon: "long arrow alternate right" },
];

async function fetchAll<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let url = path;
    while (url) {
        const response = await cachedFetch(url);
        if (!response.ok) throw new Error("Não foi possível carregar os desenhos.");
        const data = await response.json() as Paginated<T> | T[];
        if (Array.isArray(data)) {
            results.push(...data);
            break;
        }
        results.push(...data.results);
        if (!data.next) break;
        const nextPage = new URL(data.next, window.location.origin);
        url = `${path.split("?")[0]}${nextPage.search}`;
    }
    return results;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => null) as Record<string, string | string[]> | null;
    if (!data) return fallback;
    for (const value of Object.values(data)) {
        if (typeof value === "string") return value;
        if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
    return fallback;
}

function pdfFromJpeg(dataUrl: string, width: number, height: number): Blob {
    const encodedImage = dataUrl.split(",")[1];
    if (!encodedImage) throw new Error("Não foi possível converter o desenho para PDF.");
    const jpeg = Uint8Array.from(atob(encodedImage), (character) => character.charCodeAt(0));
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets = [0, 0, 0, 0, 0, 0];
    let length = 0;
    const append = (part: Uint8Array) => {
        parts.push(part);
        length += part.length;
    };
    const appendText = (text: string) => append(encoder.encode(text));
    const addObject = (id: number, body: Uint8Array[]) => {
        offsets[id] = length;
        appendText(`${id} 0 obj\n`);
        body.forEach(append);
        appendText("\nendobj\n");
    };

    appendText("%PDF-1.4\n");
    addObject(1, [encoder.encode("<< /Type /Catalog /Pages 2 0 R >>")]);
    addObject(2, [encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")]);
    addObject(3, [encoder.encode(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    )]);
    addObject(4, [
        encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
        jpeg,
        encoder.encode("\nendstream"),
    ]);
    const pageContent = encoder.encode(`q\n${WIDTH} 0 0 ${HEIGHT} 0 0 cm\n/Im0 Do\nQ`);
    addObject(5, [
        encoder.encode(`<< /Length ${pageContent.length} >>\nstream\n`),
        pageContent,
        encoder.encode("\nendstream"),
    ]);

    const crossReferenceOffset = length;
    appendText("xref\n0 6\n0000000000 65535 f \n");
    for (let id = 1; id <= 5; id += 1) {
        appendText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    }
    appendText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return new Blob([output.buffer as ArrayBuffer], { type: "application/pdf" });
}

function shapeFromDrag(type: Exclude<DrawTool, "select" | "path" | "eraser" | "text">, start: Point, end: Point, color: string, strokeWidth: number, id = crypto.randomUUID()): DrawingElement {
    if (type === "circle") {
        const dragRadius = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const defaultRadius = 18;
        if (dragRadius < 1) {
            return {
                id,
                type,
                x: Math.max(defaultRadius, Math.min(WIDTH - defaultRadius, start[0])),
                y: Math.max(defaultRadius, Math.min(HEIGHT - defaultRadius, start[1])),
                radius: defaultRadius,
                color,
                strokeWidth,
            };
        }
        const radius = Math.min(dragRadius, start[0], WIDTH - start[0], start[1], HEIGHT - start[1]);
        return { id, type, x: start[0], y: start[1], radius, color, strokeWidth };
    }
    if (type === "arrow") {
        return { id, type, x1: start[0], y1: start[1], x2: end[0], y2: end[1], color, strokeWidth };
    }
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const isClick = Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1;
    const width = isClick ? 32 : Math.max(1, Math.abs(deltaX));
    const height = isClick ? 32 : Math.max(1, Math.abs(deltaY));
    const x = Math.min(Math.min(start[0], end[0]), WIDTH - width);
    const y = Math.min(Math.min(start[1], end[1]), HEIGHT - height);
    return {
        id,
        type,
        x,
        y,
        width,
        height,
        color,
        strokeWidth,
    };
}

function elementBounds(element: DrawingElement): Bounds {
    if (element.type === "path") {
        const xs = element.points.map(([x]) => x);
        const ys = element.points.map(([, y]) => y);
        const padding = element.strokeWidth / 2;
        const left = Math.min(...xs) - padding;
        const top = Math.min(...ys) - padding;
        return {
            x: Math.max(0, left),
            y: Math.max(0, top),
            width: Math.max(1, Math.min(WIDTH, Math.max(...xs) + padding) - Math.max(0, left)),
            height: Math.max(1, Math.min(HEIGHT, Math.max(...ys) + padding) - Math.max(0, top)),
        };
    }
    if (element.type === "text") {
        return {
            x: element.x,
            y: Math.max(0, element.y - element.fontSize),
            width: Math.max(element.fontSize, element.text.length * element.fontSize * 0.6),
            height: element.fontSize,
        };
    }
    if (element.type === "rect" || element.type === "roundRect") {
        return { x: element.x, y: element.y, width: Math.max(1, element.width), height: Math.max(1, element.height) };
    }
    if (element.type === "circle") {
        return { x: element.x - element.radius, y: element.y - element.radius, width: Math.max(1, element.radius * 2), height: Math.max(1, element.radius * 2) };
    }
    const x = Math.min(element.x1, element.x2);
    const y = Math.min(element.y1, element.y2);
    return {
        x,
        y,
        width: Math.max(1, Math.abs(element.x2 - element.x1)),
        height: Math.max(1, Math.abs(element.y2 - element.y1)),
    };
}

function resizeElement(element: DrawingElement, deltaX: number, deltaY: number): DrawingElement {
    const bounds = elementBounds(element);
    const width = Math.max(4, Math.min(WIDTH - bounds.x, bounds.width + deltaX));
    const height = Math.max(4, Math.min(HEIGHT - bounds.y, bounds.height + deltaY));
    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    if (element.type === "path") {
        return {
            ...element,
            points: element.points.map(([x, y]) => [
                Math.max(0, Math.min(WIDTH, bounds.x + (x - bounds.x) * scaleX)),
                Math.max(0, Math.min(HEIGHT, bounds.y + (y - bounds.y) * scaleY)),
            ]),
        };
    }
    if (element.type === "text") {
        return { ...element, fontSize: Math.max(8, Math.min(200, element.fontSize * Math.min(scaleX, scaleY))) };
    }
    if (element.type === "rect" || element.type === "roundRect") {
        return { ...element, width, height };
    }
    if (element.type === "circle") {
        const radius = Math.max(2, Math.min(width, height) / 2);
        return {
            ...element,
            x: Math.max(radius, Math.min(WIDTH - radius, element.x)),
            y: Math.max(radius, Math.min(HEIGHT - radius, element.y)),
            radius,
        };
    }
    return {
        ...element,
        x1: Math.max(0, Math.min(WIDTH, bounds.x + (element.x1 - bounds.x) * scaleX)),
        y1: Math.max(0, Math.min(HEIGHT, bounds.y + (element.y1 - bounds.y) * scaleY)),
        x2: Math.max(0, Math.min(WIDTH, bounds.x + (element.x2 - bounds.x) * scaleX)),
        y2: Math.max(0, Math.min(HEIGHT, bounds.y + (element.y2 - bounds.y) * scaleY)),
    };
}

function moveElement(element: DrawingElement, deltaX: number, deltaY: number): DrawingElement {
    if (element.type === "path") {
        const bounds = elementBounds(element);
        const offsetX = Math.max(-bounds.x, Math.min(WIDTH - bounds.x - bounds.width, deltaX));
        const offsetY = Math.max(-bounds.y, Math.min(HEIGHT - bounds.y - bounds.height, deltaY));
        return {
            ...element,
            points: element.points.map(([x, y]) => [x + offsetX, y + offsetY]),
        };
    }
    if (element.type === "text") {
        const textWidth = Math.max(element.fontSize, element.text.length * element.fontSize * 0.6);
        return {
            ...element,
            x: Math.max(0, Math.min(WIDTH - textWidth, element.x + deltaX)),
            y: Math.max(element.fontSize, Math.min(HEIGHT, element.y + deltaY)),
        };
    }
    if (element.type === "rect" || element.type === "roundRect") {
        return {
            ...element,
            x: Math.max(0, Math.min(WIDTH - element.width, element.x + deltaX)),
            y: Math.max(0, Math.min(HEIGHT - element.height, element.y + deltaY)),
        };
    }
    if (element.type === "circle") {
        return {
            ...element,
            x: Math.max(element.radius, Math.min(WIDTH - element.radius, element.x + deltaX)),
            y: Math.max(element.radius, Math.min(HEIGHT - element.radius, element.y + deltaY)),
        };
    }
    const minX = Math.min(element.x1, element.x2);
    const maxX = Math.max(element.x1, element.x2);
    const minY = Math.min(element.y1, element.y2);
    const maxY = Math.max(element.y1, element.y2);
    const offsetX = Math.max(-minX, Math.min(WIDTH - maxX, deltaX));
    const offsetY = Math.max(-minY, Math.min(HEIGHT - maxY, deltaY));
    return {
        ...element,
        x1: element.x1 + offsetX,
        y1: element.y1 + offsetY,
        x2: element.x2 + offsetX,
        y2: element.y2 + offsetY,
    };
}

export default function DrawView({ folders, folderFilter, focusDrawingId }: Props) {
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [links, setLinks] = useState<DrawingLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newFolder, setNewFolder] = useState("");
    const [newTodo, setNewTodo] = useState("");
    const [editor, setEditor] = useState<Drawing | null>(null);
    const [tool, setTool] = useState<DrawTool>("path");
    const [color, setColor] = useState("#25282d");
    const [strokeWidth, setStrokeWidth] = useState(4);
    const [text, setText] = useState("");
    const [dirty, setDirty] = useState(false);
    const [undoCount, setUndoCount] = useState(0);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const editorRef = useRef<Drawing | null>(editor);
    const svgRef = useRef<SVGSVGElement>(null);
    const startPointRef = useRef<Point | null>(null);
    const activeElementRef = useRef<string | null>(null);
    const activeShapeToolRef = useRef<Exclude<DrawTool, "select" | "path" | "eraser" | "text"> | null>(null);
    const movingElementRef = useRef<{ id: string; start: Point; original: DrawingElement } | null>(null);
    const resizingElementRef = useRef<{ id: string; start: Point; original: DrawingElement } | null>(null);
    const erasingRef = useRef<{ removedIds: Set<string>; undoSaved: boolean } | null>(null);
    const undoStackRef = useRef<DrawingElement[][]>([]);

    useEffect(() => {
        editorRef.current = editor;
    }, [editor]);

    useEffect(() => {
        let cancelled = false;
        async function loadLibrary() {
            setLoading(true);
            try {
                const [drawingData, todoData, linkData] = await Promise.all([
                    fetchAll<Drawing>(folderFilter === undefined
                        ? "/api/drawings/"
                        : `/api/drawings/?folder=${folderFilter ?? "none"}`),
                    fetchAll<Todo>("/api/todos/"),
                    fetchAll<DrawingLink>("/api/draw-linkers/"),
                ]);
                if (cancelled) return;
                setDrawings(drawingData);
                setTodos(todoData);
                setLinks(linkData);
            } catch (reason) {
                if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os desenhos.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void loadLibrary();
        return () => { cancelled = true; };
    }, [folderFilter]);

    useEffect(() => {
        if (focusDrawingId == null) return;
        document.getElementById(`saved-drawing-${focusDrawingId}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }, [drawings, focusDrawingId]);

    function pointFromEvent(event: PointerEvent<SVGSVGElement>): Point {
        const matrix = event.currentTarget.getScreenCTM();
        if (!matrix) return [0, 0];
        const screenPoint = event.currentTarget.createSVGPoint();
        screenPoint.x = event.clientX;
        screenPoint.y = event.clientY;
        const point = screenPoint.matrixTransform(matrix.inverse());
        return [
            Math.max(0, Math.min(WIDTH, point.x)),
            Math.max(0, Math.min(HEIGHT, point.y)),
        ];
    }

    function erasePathAtPoint(event: PointerEvent<SVGSVGElement>) {
        const erasing = erasingRef.current;
        const current = editorRef.current;
        if (!erasing || !current) return;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const elementNode = target instanceof Element
            ? target.closest<SVGElement>("[data-element-id]")
            : null;
        if (!elementNode || !svgRef.current?.contains(elementNode)) return;
        const id = elementNode.dataset.elementId;
        if (!id || erasing.removedIds.has(id)) return;
        const element = current.drawing.find((item) => item.id === id);
        if (element?.type !== "path") return;

        if (!erasing.undoSaved) {
            undoStackRef.current.push(current.drawing);
            setUndoCount(undoStackRef.current.length);
            erasing.undoSaved = true;
        }
        erasing.removedIds.add(id);
        const updated = { ...current, drawing: current.drawing.filter((item) => item.id !== id) };
        editorRef.current = updated;
        setEditor(updated);
        setDirty(true);
    }

    function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
        if (!editor || event.button !== 0) return;
        const target = event.target instanceof Element
            ? event.target.closest<SVGElement>("[data-element-id]")
            : null;
        const resizeHandle = event.target instanceof Element
            ? event.target.closest<SVGElement>("[data-resize-id]")
            : null;
        const targetId = target?.dataset.elementId;
        const point = pointFromEvent(event);

        if (tool === "eraser") {
            event.currentTarget.setPointerCapture(event.pointerId);
            erasingRef.current = { removedIds: new Set(), undoSaved: false };
            erasePathAtPoint(event);
            return;
        }

        if (tool === "select" && resizeHandle) {
            const id = resizeHandle.dataset.resizeId;
            const selectedElement = editor.drawing.find((element) => element.id === id);
            if (!selectedElement) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            undoStackRef.current.push(editor.drawing);
            setUndoCount(undoStackRef.current.length);
            resizingElementRef.current = { id: selectedElement.id, start: point, original: selectedElement };
            setSelectedElementId(selectedElement.id);
            setDirty(true);
            return;
        }

        if (tool === "select") {
            if (!targetId) {
                setSelectedElementId(null);
                return;
            }
            const selectedElement = editor.drawing.find((element) => element.id === targetId);
            if (!selectedElement) return;
            setSelectedElementId(selectedElement.id);
            event.currentTarget.setPointerCapture(event.pointerId);
            undoStackRef.current.push(editor.drawing);
            setUndoCount(undoStackRef.current.length);
            movingElementRef.current = { id: selectedElement.id, start: point, original: selectedElement };
            setDirty(true);
            return;
        }

        if (tool === "text" && targetId && target?.tagName.toLowerCase() === "text") {
            const selectedElement = editor.drawing.find((element) => element.id === targetId);
            if (selectedElement?.type === "text") {
                event.currentTarget.setPointerCapture(event.pointerId);
                undoStackRef.current.push(editor.drawing);
                setUndoCount(undoStackRef.current.length);
                movingElementRef.current = { id: selectedElement.id, start: point, original: selectedElement };
                setDirty(true);
                return;
            }
        }

        if (tool !== "text" && editor.drawing.length >= 2000) {
            setError("Este desenho atingiu o limite de 2.000 elementos.");
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        if (tool === "text") {
            const value = text.trim() || window.prompt("Texto para inserir no desenho:");
            if (!value?.trim()) return;
            undoStackRef.current.push(editor.drawing);
            setUndoCount(undoStackRef.current.length);
            setEditor({
                ...editor,
                drawing: [...editor.drawing, {
                    id: crypto.randomUUID(),
                    type: "text",
                    x: point[0],
                    y: point[1],
                    text: value.trim().slice(0, 1000),
                    color,
                    fontSize: Math.max(12, strokeWidth * 6),
                }],
            });
            setDirty(true);
            return;
        }

        startPointRef.current = point;
        const id = crypto.randomUUID();
        activeElementRef.current = id;
        undoStackRef.current.push(editor.drawing);
        setUndoCount(undoStackRef.current.length);
        if (tool === "path") {
            setEditor({
                ...editor,
                drawing: [...editor.drawing, { id, type: "path", points: [point], color, strokeWidth }],
            });
        } else {
            activeShapeToolRef.current = tool;
            setEditor({
                ...editor,
                drawing: [...editor.drawing, shapeFromDrag(tool, point, point, color, strokeWidth, id)],
            });
        }
        setDirty(true);
    }

    function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
        if (erasingRef.current) {
            erasePathAtPoint(event);
            return;
        }
        const resize = resizingElementRef.current;
        if (resize) {
            const currentPoint = pointFromEvent(event);
            const deltaX = currentPoint[0] - resize.start[0];
            const deltaY = currentPoint[1] - resize.start[1];
            const resized = resizeElement(resize.original, deltaX, deltaY);
            setEditor((current) => current && ({
                ...current,
                drawing: current.drawing.map((element) => element.id === resize.id ? resized : element),
            }));
            return;
        }
        const move = movingElementRef.current;
        if (move) {
            const currentPoint = pointFromEvent(event);
            const deltaX = currentPoint[0] - move.start[0];
            const deltaY = currentPoint[1] - move.start[1];
            setEditor((current) => {
                if (!current) return current;
                const moved = moveElement(move.original, deltaX, deltaY);
                return {
                    ...current,
                    drawing: current.drawing.map((element) => element.id === move.id ? moved : element),
                };
            });
            return;
        }
        const id = activeElementRef.current;
        const start = startPointRef.current;
        if (!id || !start || !editor) return;
        const point = pointFromEvent(event);
        const shapeTool = activeShapeToolRef.current;
        setEditor((current) => {
            if (!current) return current;
            const drawing = current.drawing.map((element): DrawingElement => {
                if (element.id !== id) return element;
                if (element.type === "path") {
                    if (element.points.length >= 10000) return element;
                    return { ...element, points: [...element.points, point] };
                }
                if (!shapeTool) return element;
                return shapeFromDrag(shapeTool, start, point, color, strokeWidth, id);
            });
            return { ...current, drawing };
        });
    }

    function handlePointerUp() {
        activeElementRef.current = null;
        activeShapeToolRef.current = null;
        movingElementRef.current = null;
        resizingElementRef.current = null;
        erasingRef.current = null;
        startPointRef.current = null;
    }

    function undo() {
        const previous = undoStackRef.current.pop();
        if (!previous || !editor) return;
        setUndoCount(undoStackRef.current.length);
        setEditor({ ...editor, drawing: previous });
        setDirty(true);
    }

    function clearCanvas() {
        if (!editor || editor.drawing.length === 0) return;
        if (!window.confirm("Limpar todos os elementos deste desenho?")) return;
        undoStackRef.current.push(editor.drawing);
        setUndoCount(undoStackRef.current.length);
        setEditor({ ...editor, drawing: [] });
        setDirty(true);
    }

    async function createDrawing(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        const body: { titulo: string; drawing: DrawingElement[]; folder?: number | null } = {
            titulo: newTitle.trim(),
            drawing: [],
        };
        if (folderFilter !== undefined) body.folder = folderFilter;
        else if (newFolder) body.folder = Number(newFolder);
        try {
            const response = await cachedFetch("/api/drawings/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await errorMessage(response, "Não foi possível criar o desenho."));
            const created = await response.json() as Drawing;
            setDrawings((previous) => [created, ...previous]);
            if (newTodo) {
                const linkResponse = await cachedFetch("/api/draw-linkers/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ drawing: created.id, todo: Number(newTodo) }),
                });
                if (!linkResponse.ok) {
                    setError(`Desenho criado, mas o vínculo com a tarefa falhou: ${await errorMessage(linkResponse, "tente novamente.")}`);
                } else {
                    const createdLink = await linkResponse.json() as DrawingLink;
                    setLinks((previous) => [...previous, createdLink]);
                }
            }
            setCreating(false);
            setNewTitle("");
            setNewFolder("");
            setNewTodo("");
            setSelectedElementId(null);
            setEditor(created);
            setDirty(false);
            undoStackRef.current = [];
            setUndoCount(0);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível criar o desenho.");
        } finally {
            setBusy(false);
        }
    }

    async function saveDrawing() {
        if (!editor) return;
        setBusy(true);
        setError("");
        try {
            const response = await cachedFetch(`/api/drawings/${editor.id}/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    titulo: editor.titulo,
                    folder: editor.folder,
                    drawing: editor.drawing,
                }),
            });
            if (!response.ok) throw new Error(await errorMessage(response, "Não foi possível salvar o desenho."));
            const updated = await response.json() as Drawing;
            setDrawings((previous) => previous.map((item) => item.id === updated.id ? updated : item));
            setEditor(updated);
            setDirty(false);
            setSuccess("Desenho salvo.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o desenho.");
        } finally {
            setBusy(false);
        }
    }

    async function exportDrawing(format: "png" | "pdf") {
        const svg = svgRef.current;
        if (!editor || !svg || exporting) return;
        setExporting(true);
        setError("");
        try {
            const clone = svg.cloneNode(true) as SVGSVGElement;
            const exportWidth = WIDTH * 2;
            const exportHeight = HEIGHT * 2;
            clone.setAttribute("width", String(exportWidth));
            clone.setAttribute("height", String(exportHeight));
            const svgUrl = URL.createObjectURL(new Blob(
                [new XMLSerializer().serializeToString(clone)],
                { type: "image/svg+xml;charset=utf-8" },
            ));
            try {
                const image = new Image();
                await new Promise<void>((resolve, reject) => {
                    image.onload = () => resolve();
                    image.onerror = () => reject(new Error("Não foi possível preparar a imagem para exportação."));
                    image.src = svgUrl;
                });
                const canvas = document.createElement("canvas");
                canvas.width = exportWidth;
                canvas.height = exportHeight;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("Não foi possível criar a imagem do desenho.");
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, exportWidth, exportHeight);
                context.drawImage(image, 0, 0, exportWidth, exportHeight);

                let blob: Blob;
                if (format === "png") {
                    blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob((result) => {
                            if (result) resolve(result);
                            else reject(new Error("Não foi possível gerar o arquivo PNG."));
                        }, "image/png");
                    });
                } else {
                    blob = pdfFromJpeg(canvas.toDataURL("image/jpeg", 0.92), exportWidth, exportHeight);
                }

                const filename = editor.titulo.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "") || "desenho";
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = `${filename}.${format}`;
                link.click();
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                setSuccess(`Desenho exportado em ${format.toUpperCase()}.`);
            } finally {
                URL.revokeObjectURL(svgUrl);
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : `Não foi possível exportar o desenho em ${format.toUpperCase()}.`);
        } finally {
            setExporting(false);
        }
    }

    async function updateFolder(drawing: Drawing, value: string) {
        const response = await cachedFetch(`/api/drawings/${drawing.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: value ? Number(value) : null }),
        });
        if (!response.ok) {
            setError(await errorMessage(response, "Não foi possível alterar a pasta."));
            return;
        }
        const updated = await response.json() as Drawing;
        setDrawings((previous) => previous.map((item) => item.id === updated.id ? updated : item));
    }

    async function linkTodo(drawingId: number, todoId: string) {
        if (!todoId) return;
        const response = await cachedFetch("/api/draw-linkers/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ drawing: drawingId, todo: Number(todoId) }),
        });
        if (!response.ok) {
            setError(await errorMessage(response, "Não foi possível vincular o desenho."));
            return;
        }
        const link = await response.json() as DrawingLink;
        setLinks((previous) => [...previous, link]);
    }

    async function unlinkTodo(link: DrawingLink) {
        const response = await cachedFetch(`/api/draw-linkers/${link.id}/`, { method: "DELETE" });
        if (!response.ok) {
            setError(await errorMessage(response, "Não foi possível remover o vínculo."));
            return;
        }
        setLinks((previous) => previous.filter((item) => item.id !== link.id));
    }

    async function deleteDrawing(drawing: Drawing) {
        if (!window.confirm(`Excluir o desenho "${drawing.titulo}"? Os vínculos também serão removidos.`)) return;
        const response = await cachedFetch(`/api/drawings/${drawing.id}/`, { method: "DELETE" });
        if (!response.ok) {
            setError(await errorMessage(response, "Não foi possível excluir o desenho."));
            return;
        }
        setDrawings((previous) => previous.filter((item) => item.id !== drawing.id));
        setLinks((previous) => previous.filter((item) => item.drawing !== drawing.id));
    }

    function renderElement(element: DrawingElement, showControls = false) {
        let shape: ReactNode;
        if (element.type === "path") {
            const points = element.points.map(([x, y]) => `${x},${y}`).join(" ");
            shape = (
                <>
                    {showControls && tool === "eraser" && (
                        <polyline points={points} fill="none" stroke="transparent" strokeWidth={Math.max(14, element.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" />
                    )}
                    <polyline points={points} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
                </>
            );
        } else if (element.type === "text") {
            shape = <text x={element.x} y={element.y} fill={element.color} fontSize={element.fontSize} fontFamily="sans-serif" style={{ pointerEvents: "all" }}>{element.text}</text>;
        } else if (element.type === "rect" || element.type === "roundRect") {
            shape = <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={element.type === "roundRect" ? Math.min(24, element.height / 5, element.width / 5) : 0} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} pointerEvents="stroke" />;
        } else if (element.type === "circle") {
            shape = <circle cx={element.x} cy={element.y} r={element.radius} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} pointerEvents="stroke" />;
        } else {
            const angle = Math.atan2(element.y2 - element.y1, element.x2 - element.x1);
            const headLength = 14;
            const headAngle = Math.PI / 7;
            const headLeft: Point = [
                element.x2 - headLength * Math.cos(angle - headAngle),
                element.y2 - headLength * Math.sin(angle - headAngle),
            ];
            const headRight: Point = [
                element.x2 - headLength * Math.cos(angle + headAngle),
                element.y2 - headLength * Math.sin(angle + headAngle),
            ];
            shape = (
                <g stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" pointerEvents="stroke">
                    <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} />
                    <polyline points={`${headLeft[0]},${headLeft[1]} ${element.x2},${element.y2} ${headRight[0]},${headRight[1]}`} />
                </g>
            );
        }
        const bounds = elementBounds(element);
        const selected = showControls && tool === "select" && selectedElementId === element.id;
        return (
            <g key={element.id} data-element-id={element.id}>
                {shape}
                {selected && (
                    <>
                        <rect
                            x={bounds.x}
                            y={bounds.y}
                            width={bounds.width}
                            height={bounds.height}
                            fill="none"
                            stroke="#2563eb"
                            strokeDasharray="5 4"
                            strokeWidth="1.5"
                            pointerEvents="none"
                        />
                        <rect
                            data-resize-id={element.id}
                            x={bounds.x + bounds.width - 7}
                            y={bounds.y + bounds.height - 7}
                            width="14"
                            height="14"
                            rx="2"
                            fill="#2563eb"
                            stroke="#ffffff"
                            strokeWidth="2"
                            style={{ cursor: "nwse-resize" }}
                        />
                    </>
                )}
            </g>
        );
    }

    return (
        <section className={styles.drawView}>
            <header className={styles.heading}>
                <div>
                    <span className={styles.kicker}>ESPAÇO CRIATIVO</span>
                    <h1>{folderFilter === undefined ? "Draw" : "Desenhos da pasta"}</h1>
                    <p>{folderFilter === undefined
                        ? "Desenhe livremente, salve sem tarefa e vincule a uma tarefa quando quiser."
                        : folderFilter === null
                            ? "Desenhos que ainda não estão em uma pasta."
                            : `Desenhos salvos em ${folders.find((folder) => folder.id === folderFilter)?.name ?? "esta pasta"}.`}</p>
                </div>
                <button className={styles.primaryButton} type="button" onClick={() => { setCreating(true); setError(""); setSuccess(""); }}>
                    <i className="plus icon" /> Novo desenho
                </button>
            </header>

            {error && <div className={styles.error} role="alert">{error}</div>}
            {success && <div className={styles.success} role="status">{success}</div>}

            {creating && (
                <form className={styles.createForm} onSubmit={(event) => void createDrawing(event)}>
                    <label className={styles.field}>
                        <span>Nome do desenho</span>
                        <input required maxLength={100} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Ex.: Ideia para o projeto" />
                    </label>
                    {folderFilter === undefined && (
                        <label className={styles.field}>
                            <span>Pasta <small>(opcional)</small></span>
                            <select value={newFolder} onChange={(event) => setNewFolder(event.target.value)}>
                                <option value="">Sem pasta</option>
                                {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                            </select>
                        </label>
                    )}
                    <label className={styles.field}>
                        <span>Tarefa <small>(opcional)</small></span>
                        <select value={newTodo} onChange={(event) => setNewTodo(event.target.value)}>
                            <option value="">Sem vínculo</option>
                            {todos.map((todo) => <option value={todo.id} key={todo.id}>{todo.titulo}</option>)}
                        </select>
                    </label>
                    <div className={styles.formActions}>
                        <button className={styles.secondaryButton} type="button" onClick={() => setCreating(false)}>Cancelar</button>
                        <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Criando..." : "Criar e desenhar"}</button>
                    </div>
                </form>
            )}

            {editor && (
                <div className={styles.editor}>
                    <header className={styles.editorHeader}>
                        <label className={styles.field}>
                            <span>Nome</span>
                            <input value={editor.titulo} maxLength={100} onChange={(event) => { setEditor({ ...editor, titulo: event.target.value }); setDirty(true); }} />
                        </label>
                        <label className={styles.field}>
                            <span>Pasta</span>
                            <select value={editor.folder ?? ""} onChange={(event) => { setEditor({ ...editor, folder: event.target.value ? Number(event.target.value) : null }); setDirty(true); }}>
                                <option value="">Sem pasta</option>
                                {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                            </select>
                        </label>
                        <div className={styles.editorActions}>
                            <button className={styles.secondaryButton} type="button" onClick={() => {
                                if (dirty && !window.confirm("Descartar alterações não salvas?")) return;
                                setSelectedElementId(null);
                                setEditor(null);
                            }}>Fechar</button>
                            <button className={styles.primaryButton} type="button" onClick={() => void saveDrawing()} disabled={busy || !dirty}>
                                <i className="save icon" /> {busy ? "Salvando..." : dirty ? "Salvar desenho" : "Salvo"}
                            </button>
                        </div>
                    </header>

                    <div className={styles.toolBar} role="toolbar" aria-label="Ferramentas de desenho">
                        {TOOLS.map((item) => (
                            <button key={item.id} className={`${styles.toolButton} ${tool === item.id ? styles.toolActive : ""}`} type="button" title={item.label} aria-label={item.label} aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>
                                <i className={`${item.icon} icon`} />
                            </button>
                        ))}
                        <label className={styles.colorControl} title="Cor do traço">
                            <span>Cor</span>
                            <input aria-label="Cor do traço" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
                        </label>
                        <label className={styles.sizeControl}>
                            <span>Traço</span>
                            <input aria-label="Espessura do traço" type="range" min="1" max="20" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} />
                        </label>
                        {tool === "text" && (
                            <input className={styles.textInput} value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="Texto a inserir" aria-label="Texto a inserir" />
                        )}
                        <button className={styles.secondaryButton} type="button" onClick={() => void exportDrawing("png")} disabled={exporting} title="Baixar desenho em PNG">
                            <i className="file image outline icon" /> PNG
                        </button>
                        <button className={styles.secondaryButton} type="button" onClick={() => void exportDrawing("pdf")} disabled={exporting} title="Baixar desenho em PDF">
                            <i className="file pdf outline icon" /> PDF
                        </button>
                        <button className={styles.secondaryButton} type="button" onClick={undo} disabled={undoCount === 0} title="Desfazer"><i className="undo icon" /> Desfazer</button>
                        <button className={styles.secondaryButton} type="button" onClick={clearCanvas} disabled={editor.drawing.length === 0} title="Limpar desenho"><i className="trash alternate outline icon" /> Limpar</button>
                    </div>

                    <div className={styles.canvasWrap}>
                        <svg
                            ref={svgRef}
                            className={styles.canvas}
                            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                            role="img"
                            aria-label="Área de desenho"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            style={{ cursor: tool === "select" ? "move" : "crosshair" }}
                        >
                            <defs>
                                <marker id="draw-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                                </marker>
                            </defs>
                            <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
                            {editor.drawing.map((element) => renderElement(element, true))}
                        </svg>
                    </div>
                    <span className={styles.canvasHint}>Use Selecionar e mover para reposicionar ou redimensionar elementos. Escolha Borracha e arraste sobre os traços livres para apagá-los; use Desfazer para restaurá-los. Para texto novo, clique no local desejado.</span>
                </div>
            )}

            <div className={styles.libraryHeading}>
                <h2>{folderFilter === undefined ? "Seus desenhos" : "Desenhos nesta pasta"}</h2>
                <span>{drawings.length} desenhos</span>
            </div>
            {loading ? (
                <div className={styles.emptyState}>Carregando desenhos...</div>
            ) : drawings.length === 0 ? (
                <div className={styles.emptyState}>Nenhum desenho salvo. Crie um sem tarefa ou pasta, se preferir.</div>
            ) : (
                <div className={styles.drawingList}>
                    {drawings.map((drawing) => {
                        const drawingLinks = links.filter((link) => link.drawing === drawing.id);
                        const availableTodos = todos.filter((todo) => !drawingLinks.some((link) => link.todo === todo.id));
                        return (
                            <article className={styles.drawingCard} id={`saved-drawing-${drawing.id}`} key={drawing.id}>
                                <button className={styles.preview} type="button" onClick={() => { setSelectedElementId(null); setEditor(drawing); setDirty(false); undoStackRef.current = []; setUndoCount(0); }}>
                                    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
                                        <defs>
                                            <marker id={`draw-arrowhead-${drawing.id}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                                                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                                            </marker>
                                        </defs>
                                        {drawing.drawing.map((element) => renderElement(element))}
                                    </svg>
                                </button>
                                <header className={styles.cardHeader}>
                                    <div><h3>{drawing.titulo}</h3><span>{new Date(drawing.updated_at).toLocaleString("pt-BR")}</span></div>
                                    <button className={styles.deleteButton} type="button" title="Excluir desenho" aria-label={`Excluir desenho ${drawing.titulo}`} onClick={() => void deleteDrawing(drawing)}><i className="trash icon" aria-hidden="true" /></button>
                                </header>
                                <label className={styles.field}>
                                    <span>Pasta</span>
                                    <select value={drawing.folder ?? ""} onChange={(event) => void updateFolder(drawing, event.target.value)}>
                                        <option value="">Sem pasta</option>
                                        {folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}
                                    </select>
                                </label>
                                {drawingLinks.map((link) => (
                                    <div className={styles.todoLink} key={link.id}>
                                        <span><i className="tasks icon" /> {link.todo_titulo}</span>
                                        <button type="button" onClick={() => void unlinkTodo(link)}>Desvincular</button>
                                    </div>
                                ))}
                                <form className={styles.linkForm} onSubmit={(event) => {
                                    event.preventDefault();
                                    const select = event.currentTarget.elements.namedItem("todo") as HTMLSelectElement;
                                    void linkTodo(drawing.id, select.value);
                                    select.value = "";
                                }}>
                                    <select name="todo" aria-label={`Vincular ${drawing.titulo} a uma tarefa`}>
                                        <option value="">Vincular a uma tarefa...</option>
                                        {availableTodos.map((todo) => <option value={todo.id} key={todo.id}>{todo.titulo}</option>)}
                                    </select>
                                    <button type="submit">Vincular</button>
                                </form>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
