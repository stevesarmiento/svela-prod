import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { MismatchDirection } from 'lightweight-charts';
import { clampNumber, formatUsdPrice, formatUsdVolume, getSeriesValue } from '../utils';

export interface AxisOverlay {
    setFallbackValues: (values: { dataLastPrice: number | null; dataLastVolume: number | null }) => void;
    setSeries: (series: {
        priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
        volumeSeries: ISeriesApi<'Histogram'> | null;
    }) => void;
    onCrosshairLeave: () => void;
    onCrosshairMove: (args: { price: number | null; volume: number | null; x: number | null }) => void;
    scheduleUpdate: () => void;
    onResize: () => void;
    destroy: () => void;
}

interface CreateAxisOverlayArgs {
    containerEl: HTMLDivElement;
    chart: IChartApi;
    priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
    volumeSeries: ISeriesApi<'Histogram'> | null;
    onAfterUpdate?: () => void;
}

export function createAxisOverlay({
    containerEl,
    chart,
    priceSeries: initialPriceSeries,
    volumeSeries: initialVolumeSeries,
    onAfterUpdate,
}: CreateAxisOverlayArgs): AxisOverlay {
    containerEl.style.position = containerEl.style.position || 'relative';

    const axisLabelsEl = document.createElement('div');
    axisLabelsEl.className = 'pointer-events-none absolute inset-0 z-20';
    axisLabelsEl.setAttribute('aria-hidden', 'true');

    // Volume scrub marker (dot at the top of the hovered volume bar).
    const volumeScrubMarker = document.createElement('div');
    volumeScrubMarker.className = 'pointer-events-none absolute left-0 top-0 z-10';
    volumeScrubMarker.style.display = 'none';
    volumeScrubMarker.style.width = '10px';
    volumeScrubMarker.style.height = '10px';
    volumeScrubMarker.style.borderRadius = '9999px';
    volumeScrubMarker.style.boxSizing = 'border-box';
    volumeScrubMarker.style.border = '2px solid rgba(255, 255, 255, 0.95)';
    volumeScrubMarker.style.backgroundColor = 'rgba(63, 63, 70, 0.95)'; // zinc-700
    volumeScrubMarker.style.transform = 'translate3d(0, 0, 0) translate(-50%, -50%)';

    const prefersReducedMotion =
        typeof window !== 'undefined' && 'matchMedia' in window
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
    const axisTagTransitionLast = prefersReducedMotion ? '' : 'transform 140ms ease-out';
    const axisTagTransitionHover = prefersReducedMotion ? '' : 'transform 90ms ease-out';

    const TAG_CLASS =
        "relative inline-flex items-center rounded-md bg-white text-zinc-950 px-3 py-1.5 font-diatype-mono text-[11px] leading-none tabular-nums shadow-sm shadow-black/10 ring-1 ring-black/10 before:content-[''] before:absolute before:-left-[6px] before:top-1/2 before:-translate-y-1/2 before:border-y-[10px] before:border-y-transparent before:border-r-[8px] before:border-r-white";

    const priceLastLabelWrap = document.createElement('div');
    priceLastLabelWrap.className = 'pointer-events-none absolute right-0 top-0';
    priceLastLabelWrap.style.transition = axisTagTransitionLast;
    const priceLastLabel = document.createElement('div');
    priceLastLabel.className = TAG_CLASS;
    priceLastLabelWrap.appendChild(priceLastLabel);

    const priceHoverLabelWrap = document.createElement('div');
    priceHoverLabelWrap.className = 'pointer-events-none absolute right-0 top-0 z-10';
    priceHoverLabelWrap.style.transition = axisTagTransitionHover;
    const priceHoverLabel = document.createElement('div');
    priceHoverLabel.className = TAG_CLASS;
    priceHoverLabelWrap.appendChild(priceHoverLabel);

    const volumeLastLabelWrap = document.createElement('div');
    volumeLastLabelWrap.className = 'pointer-events-none absolute right-0 top-0';
    volumeLastLabelWrap.style.transition = axisTagTransitionLast;
    const volumeLastLabel = document.createElement('div');
    volumeLastLabel.className = TAG_CLASS;
    volumeLastLabelWrap.appendChild(volumeLastLabel);

    const volumeHoverLabelWrap = document.createElement('div');
    volumeHoverLabelWrap.className = 'pointer-events-none absolute right-0 top-0 z-10';
    volumeHoverLabelWrap.style.transition = axisTagTransitionHover;
    const volumeHoverLabel = document.createElement('div');
    volumeHoverLabel.className = TAG_CLASS;
    volumeHoverLabelWrap.appendChild(volumeHoverLabel);

    axisLabelsEl.appendChild(priceLastLabelWrap);
    axisLabelsEl.appendChild(priceHoverLabelWrap);
    axisLabelsEl.appendChild(volumeLastLabelWrap);
    axisLabelsEl.appendChild(volumeHoverLabelWrap);
    axisLabelsEl.appendChild(volumeScrubMarker);

    // Dashed hover connector (from hovered point to the right-side label).
    const hoverPriceLineWrap = document.createElement('div');
    hoverPriceLineWrap.className = 'pointer-events-none absolute left-0 top-0 z-0';
    hoverPriceLineWrap.style.transition = axisTagTransitionHover;
    hoverPriceLineWrap.style.display = 'none';

    const hoverPriceLine = document.createElement('div');
    hoverPriceLine.style.height = '1px';
    hoverPriceLine.style.width = `${containerEl.clientWidth}px`;
    hoverPriceLine.style.transformOrigin = 'left center';
    hoverPriceLine.style.transition = axisTagTransitionHover;
    hoverPriceLine.style.backgroundImage =
        'repeating-linear-gradient(to right, rgba(161, 161, 170, 0.55) 0, rgba(161, 161, 170, 0.55) 6px, rgba(161, 161, 170, 0) 6px, rgba(161, 161, 170, 0) 10px)';
    hoverPriceLineWrap.appendChild(hoverPriceLine);
    axisLabelsEl.appendChild(hoverPriceLineWrap);

    // Dashed hover connector for volume (from hovered bar to the right-side label).
    const hoverVolumeLineWrap = document.createElement('div');
    hoverVolumeLineWrap.className = 'pointer-events-none absolute left-0 top-0 z-0';
    hoverVolumeLineWrap.style.transition = axisTagTransitionHover;
    hoverVolumeLineWrap.style.display = 'none';

    const hoverVolumeLine = document.createElement('div');
    hoverVolumeLine.style.height = '1px';
    hoverVolumeLine.style.width = `${containerEl.clientWidth}px`;
    hoverVolumeLine.style.transformOrigin = 'left center';
    hoverVolumeLine.style.transition = axisTagTransitionHover;
    hoverVolumeLine.style.backgroundImage =
        'repeating-linear-gradient(to right, rgba(161, 161, 170, 0.55) 0, rgba(161, 161, 170, 0.55) 6px, rgba(161, 161, 170, 0) 6px, rgba(161, 161, 170, 0) 10px)';
    hoverVolumeLineWrap.appendChild(hoverVolumeLine);
    axisLabelsEl.appendChild(hoverVolumeLineWrap);

    containerEl.appendChild(axisLabelsEl);

    let isMounted = true;
    let priceSeries = initialPriceSeries;
    let volumeSeries = initialVolumeSeries;

    let isCrosshairActive = false;
    let lastCrosshairPrice: number | null = null;
    let lastCrosshairVolume: number | null = null;
    let lastCrosshairX: number | null = null;

    let axisUpdateRaf: number | null = null;
    let interactionRaf: number | null = null;

    let dataLastPrice: number | null = null;
    let dataLastVolume: number | null = null;

    function setAxisTag(
        wrapEl: HTMLDivElement,
        labelEl: HTMLDivElement,
        y: number | null,
        text: string | null,
        xOffsetPx = 0,
    ) {
        if (!isMounted || y == null || !Number.isFinite(y) || !text) {
            wrapEl.style.display = 'none';
            return;
        }

        const clampedY = clampNumber(y, 16, containerEl.clientHeight - 16);
        wrapEl.style.display = 'block';
        wrapEl.style.transform = `translate3d(${xOffsetPx}px, ${clampedY}px, 0) translateY(-50%)`;
        labelEl.textContent = text;
    }

    function setHoverLine(
        wrapEl: HTMLDivElement,
        lineEl: HTMLDivElement,
        xStart: number | null,
        y: number | null,
        isVisible: boolean,
    ) {
        if (
            !isMounted ||
            !isVisible ||
            xStart == null ||
            y == null ||
            !Number.isFinite(xStart) ||
            !Number.isFinite(y)
        ) {
            wrapEl.style.display = 'none';
            return;
        }

        const clampedY = clampNumber(y, 16, containerEl.clientHeight - 16);
        const width = Math.max(1, containerEl.clientWidth);
        const x0 = clampNumber(xStart, 0, width);
        const xEnd = width - 2;
        const length = Math.max(0, xEnd - x0);
        const scaleX = clampNumber(length / width, 0, 1);

        wrapEl.style.display = 'block';
        wrapEl.style.transform = `translate3d(${x0}px, ${clampedY}px, 0) translateY(-50%)`;
        lineEl.style.transform = `scaleX(${scaleX})`;
    }

    function setVolumeScrubMarker(x: number | null, volumeValue: number | null) {
        if (
            !isMounted ||
            !volumeSeries ||
            x == null ||
            volumeValue == null ||
            !Number.isFinite(x) ||
            !Number.isFinite(volumeValue)
        ) {
            volumeScrubMarker.style.display = 'none';
            return;
        }

        const y = volumeSeries.priceToCoordinate(volumeValue);
        if (y == null || !Number.isFinite(y)) {
            volumeScrubMarker.style.display = 'none';
            return;
        }

        volumeScrubMarker.style.display = 'block';
        volumeScrubMarker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }

    function updateAxisLabels(hoveredPrice: number | null, hoveredVolume: number | null) {
        const logicalRange = chart.timeScale().getVisibleLogicalRange();
        const rightIndexRaw = logicalRange ? Math.floor(logicalRange.to) : null;
        const rightIndex = rightIndexRaw == null ? null : Math.max(0, rightIndexRaw);

        const mainPriceValue =
            rightIndex == null
                ? dataLastPrice
                : (getSeriesValue(priceSeries.dataByIndex(rightIndex, MismatchDirection.NearestLeft)) ??
                  getSeriesValue(priceSeries.dataByIndex(rightIndex, MismatchDirection.NearestRight)) ??
                  dataLastPrice);

        const mainVolumeValue =
            !volumeSeries || rightIndex == null
                ? dataLastVolume
                : (getSeriesValue(volumeSeries.dataByIndex(rightIndex, MismatchDirection.NearestLeft)) ??
                  getSeriesValue(volumeSeries.dataByIndex(rightIndex, MismatchDirection.NearestRight)) ??
                  dataLastVolume);

        const lastPriceY =
            mainPriceValue == null || !Number.isFinite(mainPriceValue)
                ? null
                : priceSeries.priceToCoordinate(mainPriceValue);
        setAxisTag(
            priceLastLabelWrap,
            priceLastLabel,
            lastPriceY,
            mainPriceValue == null ? null : formatUsdPrice(mainPriceValue),
        );

        const shouldShowHoverPrice =
            isCrosshairActive &&
            hoveredPrice != null &&
            Number.isFinite(hoveredPrice) &&
            (mainPriceValue == null || hoveredPrice !== mainPriceValue);
        const hoveredPriceY = !shouldShowHoverPrice ? null : priceSeries.priceToCoordinate(hoveredPrice);
        setAxisTag(
            priceHoverLabelWrap,
            priceHoverLabel,
            hoveredPriceY,
            !shouldShowHoverPrice ? null : formatUsdPrice(hoveredPrice),
        );

        setHoverLine(hoverPriceLineWrap, hoverPriceLine, lastCrosshairX, hoveredPriceY, shouldShowHoverPrice);

        if (!volumeSeries) {
            setAxisTag(volumeLastLabelWrap, volumeLastLabel, null, null);
            setAxisTag(volumeHoverLabelWrap, volumeHoverLabel, null, null);
            setHoverLine(hoverVolumeLineWrap, hoverVolumeLine, null, null, false);
            return;
        }

        const lastVolumeY =
            mainVolumeValue == null || !Number.isFinite(mainVolumeValue)
                ? null
                : volumeSeries.priceToCoordinate(mainVolumeValue);
        setAxisTag(
            volumeLastLabelWrap,
            volumeLastLabel,
            lastVolumeY,
            mainVolumeValue == null ? null : formatUsdVolume(mainVolumeValue),
        );

        const shouldShowHoverVolume =
            isCrosshairActive &&
            hoveredVolume != null &&
            Number.isFinite(hoveredVolume) &&
            (mainVolumeValue == null || hoveredVolume !== mainVolumeValue);
        const hoveredVolumeY = !shouldShowHoverVolume ? null : volumeSeries.priceToCoordinate(hoveredVolume);
        setAxisTag(
            volumeHoverLabelWrap,
            volumeHoverLabel,
            hoveredVolumeY,
            !shouldShowHoverVolume ? null : formatUsdVolume(hoveredVolume),
        );

        setHoverLine(hoverVolumeLineWrap, hoverVolumeLine, lastCrosshairX, hoveredVolumeY, shouldShowHoverVolume);
    }

    function runUpdate() {
        updateAxisLabels(isCrosshairActive ? lastCrosshairPrice : null, isCrosshairActive ? lastCrosshairVolume : null);
        setVolumeScrubMarker(lastCrosshairX, isCrosshairActive ? lastCrosshairVolume : null);
        onAfterUpdate?.();
    }

    function scheduleUpdate() {
        if (axisUpdateRaf != null) cancelAnimationFrame(axisUpdateRaf);
        axisUpdateRaf = requestAnimationFrame(() => {
            axisUpdateRaf = null;
            runUpdate();
        });
    }

    function startInteractionLoop() {
        if (interactionRaf != null) return;
        const tick = () => {
            interactionRaf = requestAnimationFrame(tick);
            runUpdate();
        };
        interactionRaf = requestAnimationFrame(tick);
    }

    function stopInteractionLoop() {
        if (interactionRaf == null) return;
        cancelAnimationFrame(interactionRaf);
        interactionRaf = null;
    }

    const handlePointerDown = () => startInteractionLoop();
    const handlePointerUp = () => {
        stopInteractionLoop();
        scheduleUpdate();
    };
    const handleWheel = () => scheduleUpdate();

    // Use capture so we still catch events if the chart stops propagation.
    containerEl.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { capture: true });
    containerEl.addEventListener('wheel', handleWheel, { passive: true });

    function onCrosshairLeave() {
        isCrosshairActive = false;
        lastCrosshairPrice = null;
        lastCrosshairVolume = null;
        lastCrosshairX = null;
        volumeScrubMarker.style.display = 'none';
        scheduleUpdate();
    }

    function onCrosshairMove(args: { price: number | null; volume: number | null; x: number | null }) {
        isCrosshairActive = true;
        lastCrosshairPrice = args.price;
        lastCrosshairVolume = args.volume;
        lastCrosshairX = args.x;
        runUpdate();
    }

    function setFallbackValues(values: { dataLastPrice: number | null; dataLastVolume: number | null }) {
        dataLastPrice = values.dataLastPrice;
        dataLastVolume = values.dataLastVolume;
        scheduleUpdate();
    }

    function setSeries(series: {
        priceSeries: ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;
        volumeSeries: ISeriesApi<'Histogram'> | null;
    }) {
        priceSeries = series.priceSeries;
        volumeSeries = series.volumeSeries;
        scheduleUpdate();
    }

    function onResize() {
        hoverPriceLine.style.width = `${containerEl.clientWidth}px`;
        hoverVolumeLine.style.width = `${containerEl.clientWidth}px`;
        scheduleUpdate();
    }

    function destroy() {
        isMounted = false;
        if (axisUpdateRaf != null) cancelAnimationFrame(axisUpdateRaf);
        stopInteractionLoop();
        containerEl.removeEventListener('pointerdown', handlePointerDown, { capture: true });
        window.removeEventListener('pointerup', handlePointerUp, { capture: true });
        window.removeEventListener('pointercancel', handlePointerUp, { capture: true });
        containerEl.removeEventListener('wheel', handleWheel);
        if (axisLabelsEl.parentNode) axisLabelsEl.parentNode.removeChild(axisLabelsEl);
    }

    // Initial render
    scheduleUpdate();

    return {
        setFallbackValues,
        setSeries,
        onCrosshairLeave,
        onCrosshairMove,
        scheduleUpdate,
        onResize,
        destroy,
    };
}
