"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import {
  cameraHomeFor,
  type CameraRequest,
  type PlaneSize,
} from "../../lib/scene-model";

/**
 * Constrained camera moves for the accessibility map.
 *
 * A selection centers the affected element by moving the controls target
 * and shortening the camera distance along the CURRENT view direction:
 * short, no spinning, orientation preserved. Reset returns home.
 * Reduced motion jumps instead of animating.
 */

interface Props {
  request: CameraRequest | null;
  resetNonce: number;
  plane: PlaneSize;
  reducedMotion: boolean;
}

export function SceneCameraController({ request, resetNonce, plane, reducedMotion }: Props): React.JSX.Element | null {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ destPos: THREE.Vector3; destTarget: THREE.Vector3 } | null>(null);
  const lastNonce = useRef<number>(-1);
  const lastReset = useRef<number>(-1);

  useEffect(() => {
    if (request === null || controls === null) return;
    if (request.nonce === lastNonce.current) return;
    lastNonce.current = request.nonce;
    // Preserve orientation: move along the current view direction.
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.08, 1);
    dir.normalize();
    const destTarget = new THREE.Vector3(request.point.x, request.point.y, 0);
    const destPos = destTarget.clone().add(dir.multiplyScalar(request.distance));
    if (reducedMotion) {
      camera.position.copy(destPos);
      controls.target.copy(destTarget);
      controls.update();
      invalidate();
      return;
    }
    anim.current = { destPos, destTarget };
    invalidate();
  }, [request, controls, camera, reducedMotion, invalidate]);

  useEffect(() => {
    if (controls === null || resetNonce === 0 || resetNonce === lastReset.current) return;
    lastReset.current = resetNonce;
    const home = cameraHomeFor(plane);
    const destPos = new THREE.Vector3(...home.position);
    const destTarget = new THREE.Vector3(...home.target);
    if (reducedMotion) {
      camera.position.copy(destPos);
      controls.target.copy(destTarget);
      controls.update();
      invalidate();
      return;
    }
    anim.current = { destPos, destTarget };
    invalidate();
  }, [resetNonce, controls, camera, plane, reducedMotion, invalidate]);

  useFrame((state, delta) => {
    const job = anim.current;
    if (job === null || controls === null) return;
    const step = 1 - Math.exp(-6 * Math.min(Math.max(delta, 0), 0.05));
    camera.position.lerp(job.destPos, step);
    controls.target.lerp(job.destTarget, step);
    controls.update();
    if (camera.position.distanceTo(job.destPos) < 0.02 && controls.target.distanceTo(job.destTarget) < 0.02) {
      camera.position.copy(job.destPos);
      controls.target.copy(job.destTarget);
      controls.update();
      anim.current = null;
    }
    state.invalidate();
  });

  return null;
}
