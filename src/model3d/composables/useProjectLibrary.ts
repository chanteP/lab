import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import { useMessage } from 'naive-ui';
import type { Viewport, ViewTool } from '../engine/Viewport';
import { exportGLB, exportProject, exportSTL } from '../engine/exporters';
import { deleteProject, getActiveProjectId, listProjects, putProject, setActiveProjectId } from '../stores/store';
import { uid } from '../utils/id';
import { storedLengthUnit } from './useUnits';
import {
    cloneDocument, createDocument, isDocument, normalizeDocument,
    type GeometryQuality, type LengthUnit, type ModelDocument, type ProjectRecord, type SketchPlane,
} from '../types';

interface ProjectLibraryOptions {
    document: Ref<ModelDocument>;
    selectedIds: Ref<string[]>;
    activePlaneId: Ref<string | null>;
    activePlane: ComputedRef<SketchPlane | null>;
    lengthUnit: Ref<LengthUnit>;
    isolateActive: Ref<boolean>;
    sectionActive: Ref<boolean>;
    viewport: () => Viewport | undefined;
    clearHistory: () => void;
    cancelSketch: () => void;
    setTool: (tool: ViewTool) => void;
    message: ReturnType<typeof useMessage>;
}

/** Owns project records, browser persistence and document import/export. */
export function useProjectLibrary(options: ProjectLibraryOptions) {
    const {
        document, selectedIds, activePlaneId, activePlane, lengthUnit, isolateActive, sectionActive,
        viewport, clearHistory, cancelSketch, setTool, message,
    } = options;
    const importInput = ref<HTMLInputElement>();
    const projects = ref<ProjectRecord[]>([]);
    const project = ref<ProjectRecord>(createProject('未命名项目'));
    const saveState = ref<'saved' | 'saving' | 'dirty'>('saved');
    const exportQuality = ref<GeometryQuality>('high');
    const exporting = ref(false);
    const showNewProject = ref(false);
    const newProjectName = ref('未命名项目');
    let saveTimer: ReturnType<typeof setTimeout>;
    let restoring = false;

    const projectOptions = computed(() => projects.value.map((item) => ({ label: item.name, value: item.id })));

    function createProject(name: string): ProjectRecord {
        const now = Date.now();
        return { id: uid(), name, createdAt: now, updatedAt: now, document: createDocument(storedLengthUnit()) };
    }
    function clearSaveTimer() { clearTimeout(saveTimer); }
    async function flushSave() {
        clearSaveTimer();
        if (!project.value.id) return;
        saveState.value = 'saving';
        try {
            project.value.document = cloneDocument(document.value);
            project.value.updatedAt = Date.now();
            await putProject(project.value);
            const index = projects.value.findIndex((item) => item.id === project.value.id);
            if (index >= 0) projects.value[index] = { ...project.value };
            saveState.value = 'saved';
        } catch (error) {
            saveState.value = 'dirty';
            message.error(`本地保存失败：${(error as Error).message}`);
        }
    }
    function scheduleSave() {
        if (restoring) return;
        saveState.value = 'dirty';
        clearSaveTimer();
        saveTimer = setTimeout(flushSave, 650);
    }
    async function openProject(id: string, saveCurrent = true) {
        if (id === project.value.id) return;
        if (saveCurrent) await flushSave();
        const next = projects.value.find((item) => item.id === id);
        if (!next) return;
        cancelSketch();
        restoring = true;
        project.value = next;
        document.value = normalizeDocument(cloneDocument(next.document));
        lengthUnit.value = storedLengthUnit();
        activePlaneId.value = document.value.planes[0]?.id || null;
        selectedIds.value = [];
        isolateActive.value = false;
        sectionActive.value = false;
        viewport()?.setIsolate(null);
        viewport()?.setSection(false);
        clearHistory();
        setActiveProjectId(id);
        setTool('select');
        await nextTick();
        viewport()?.sync(document.value);
        viewport()?.setActivePlane(activePlane.value);
        viewport()?.fit();
        restoring = false;
        saveState.value = 'saved';
    }
    async function reloadProjects() { projects.value = await listProjects(); }
    async function newProject() {
        await flushSave();
        const next = createProject(newProjectName.value.trim() || '未命名项目');
        await putProject(next);
        await reloadProjects();
        showNewProject.value = false;
        newProjectName.value = '未命名项目';
        await openProject(next.id);
    }
    async function duplicateProject() {
        const copy = createProject(`${project.value.name} 副本`);
        copy.document = cloneDocument(document.value);
        await putProject(copy);
        await reloadProjects();
        await openProject(copy.id);
        message.success('已创建项目副本');
    }
    async function removeProject() {
        await deleteProject(project.value.id);
        await reloadProjects();
        if (!projects.value.length) {
            const next = createProject('未命名项目');
            await putProject(next);
            await reloadProjects();
        }
        await openProject(projects.value[0].id, false);
        message.success('项目已删除');
    }

    async function runExport(type: 'stl' | 'glb') {
        if (!document.value.entities.some((item) => item.visible)) return message.warning('没有可导出的可见实体');
        exporting.value = true;
        await flushSave();
        try {
            await new Promise((resolve) => setTimeout(resolve, 30));
            if (type === 'stl') exportSTL(document.value, project.value.name, exportQuality.value);
            else await exportGLB(document.value, project.value.name, exportQuality.value);
            message.success(`${type.toUpperCase()} 已导出`);
        } catch (error) {
            message.error(`导出失败：${(error as Error).message}`);
        } finally { exporting.value = false; }
    }
    function onExportAction(type: 'stl' | 'glb' | 'project') {
        if (type === 'project') exportProject(document.value, project.value.name);
        else runExport(type);
    }
    function importProject() { importInput.value?.click(); }
    async function onImportFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!isDocument(data)) throw new Error('不是有效的 Form 3D 项目文件');
            const next = createProject(file.name.replace(/\.model\.json$|\.json$/g, '') || '导入项目');
            next.document = normalizeDocument(cloneDocument(data));
            await putProject(next);
            await reloadProjects();
            await openProject(next.id);
            message.success('项目已导入');
        } catch (error) { message.error((error as Error).message); }
    }

    async function initializeProjects() {
        await reloadProjects();
        const active = getActiveProjectId();
        const initial = projects.value.find((item) => item.id === active) || projects.value[0];
        if (initial) await openProject(initial.id, false);
        else {
            await flushSave();
            await reloadProjects();
            setActiveProjectId(project.value.id);
        }
    }

    return {
        importInput, projects, project, projectOptions, saveState, exportQuality, exporting,
        showNewProject, newProjectName, flushSave, scheduleSave, clearSaveTimer, openProject,
        reloadProjects, newProject, duplicateProject, removeProject, runExport, onExportAction,
        importProject, onImportFile, initializeProjects,
    };
}
