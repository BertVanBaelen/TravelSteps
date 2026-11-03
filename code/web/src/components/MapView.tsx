import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { LatLng } from '@travelsteps/shared';
import { formatDate, mediaUrl } from '../lib/format';
import {
  DEFAULT_COLOR,
  HIGHLIGHT_COLOR,
  createMap,
  drawPost,
  fitTo,
  prefersReducedMotion,
  type MapPostLike,
} from '../lib/map';

interface Props {
  posts: MapPostLike[];
  colorFor?: (travelId: string) => string;
  interactive?: boolean;
  /** Draw the connections from the previous posts. */
  arrivals?: boolean;
  /** Show a popup with a post preview on marker tap; `onOpen` is called when it is tapped. */
  onOpen?: (postId: string) => void;
  /** The step to show: drawn in Sunset and zoomed to (null = fit all steps). */
  focusId?: string | null;
  /** Marker tap chooses that step (instead of a popup). */
  onSelect?: (postId: string) => void;
  className?: string;
}

function popupContent(post: MapPostLike, onOpen: (id: string) => void): HTMLElement {
  const a = document.createElement('a');
  a.className = 'map-popup';
  a.href = `/post/${post.id}`;
  if (post.coverAssetId) {
    const img = document.createElement('img');
    img.src = mediaUrl(post.coverAssetId, 'thumbnail');
    img.alt = '';
    a.append(img);
  }
  const text = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = post.title;
  const date = document.createElement('small');
  date.textContent = formatDate(post.date);
  text.append(title, date);
  a.append(text);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    onOpen(post.id);
  });
  return a;
}

/** Leaflet map with the posts' points and routes. Created only once it scrolls into view. */
export function MapView({
  posts,
  colorFor,
  interactive = true,
  arrivals = false,
  onOpen,
  focusId = null,
  onSelect,
  className,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !elRef.current) return;
    const map = createMap(elRef.current, interactive);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [visible, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: LatLng[] = [];
    let focusPoints: LatLng[] = [];
    // The focused step is drawn last, so it lies on top.
    const ordered = focusId
      ? [...posts.filter((p) => p.id !== focusId), ...posts.filter((p) => p.id === focusId)]
      : posts;
    for (const post of ordered) {
      const focused = post.id === focusId;
      const color = focused ? HIGHLIGHT_COLOR : (colorFor?.(post.travelId) ?? DEFAULT_COLOR);
      const onClick = onSelect
        ? () => onSelect(post.id)
        : onOpen
          ? (marker: L.CircleMarker) => {
              marker.unbindTooltip();
              marker.bindPopup(popupContent(post, onOpen), { closeButton: false }).openPopup();
            }
          : undefined;
      const drawn = drawPost(layer, post, color, {
        arrival: arrivals,
        onClick,
        highlight: focused,
      });
      points.push(...drawn);
      if (focused) focusPoints = post.locations.map((l) => [l.lat, l.lng] as LatLng);
    }
    if (focusPoints.length > 0) fitTo(map, focusPoints, 12, !prefersReducedMotion());
    else fitTo(map, points);
  }, [visible, posts, colorFor, arrivals, onOpen, focusId, onSelect]);

  return <div ref={elRef} className={`map ${className ?? ''}`} />;
}
