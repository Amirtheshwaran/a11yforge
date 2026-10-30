"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Line, RoundedBox } from "@react-three/drei";
import type { PlaneSize } from "../../lib/scene-model";

/**
 * The tested webpage: the latest real browser screenshot as a texture on
 * a large plane. Aspect ratio always matches the capture. Without a
 * screenshot (scan still opening) the plane is a blank loading surface.
 * Unlit material — the capture must read exactly, never relit.
 */

const FRAME = "#8a8a8a";
const BLANK = "#101010";

interface Props {
  textureUrl: string | null;
  plane: PlaneSize;
}

export function WebsitePlane({ textureUrl, plane }: Props): React.JSX.Element {
  const invalidate = useThree((s) => s.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    setTexture(null);
    if (textureUrl === null) return;
    let live = true;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      textureUrl,
      (loaded) => {
        if (!live) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        setTexture(loaded);
        invalidate();
      },
      undefined,
      () => {
        // Screenshot missing/expired: stay on the blank surface instead of
        // breaking the scene. The HTML fallback still shows the 2D shot.
        if (live) {
          setTexture(null);
          invalidate();
        }
      },
    );
    return () => {
      live = false;
    };
  }, [textureUrl, invalidate]);

  useEffect(() => {
    return () => {
      setTexture((current) => {
        current?.dispose();
        return null;
      });
    };
  }, []);

  const corners: [number, number, number][] = [
    [-plane.width / 2, plane.height / 2, 0.005],
    [plane.width / 2, plane.height / 2, 0.005],
    [plane.width / 2, -plane.height / 2, 0.005],
    [-plane.width / 2, -plane.height / 2, 0.005],
    [-plane.width / 2, plane.height / 2, 0.005],
  ];

  return (
    <group>
      <RoundedBox args={[plane.width + 0.2, plane.height + 0.2, 0.2]} radius={0.08} smoothness={4} position={[0, 0, -0.12]}>
        <meshStandardMaterial color="#464b48" roughness={0.3} metalness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[plane.width, plane.height]} />
        {texture !== null ? (
          <meshBasicMaterial key={texture.uuid} map={texture} toneMapped={false} />
        ) : (
          <meshBasicMaterial key="blank" color={BLANK} toneMapped={false} />
        )}
      </mesh>
      <Line points={corners} color={FRAME} lineWidth={1} transparent opacity={0.9} />
    </group>
  );
}
