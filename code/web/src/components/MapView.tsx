import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { LatLng } from '@travelsteps/shared';
import { formatDate, mediaUrl } from '../lib/format';
import { DEFAULT_COLOR, createMap, drawPost, fitTo, type MapPostLike } from '../lib/map';

interface Props {
  posts: MapPostLike[];
  colorFor?: (travelId: string) => string;
  interactive?: boolean;
  /** Draw the connections from the previous posts. */
  arrivals?: boolean;
  /** Show a popup with a post preview on marker tap; `onOpen` is called when it is tapped. */
  onOpen?: (postId: string) => void;
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
    for (const post of posts) {
      const color = colorFor?.(post.travelId) ?? DEFAULT_COLOR;
      points.push(
        ...drawPost(layer, post, color, {
          arrival: arrivals,
          onClick: onOpen
            ? (marker) => {
                marker.unbindTooltip();
                marker.bindPopup(popupContent(post, onOpen), { closeButton: false }).openPopup();
              }
            : undefined,
        }),
      );
    }
    fitTo(map, points);
  }, [visible, posts, colorFor, arrivals, onOpen]);

  return <div ref={elRef} className={`map ${className ?? ''}`} />;
}
