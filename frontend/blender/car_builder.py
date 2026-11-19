"""Procedural car models for the ParkVision tour (front = +Y, up = +Z, width = X).

Contract kept for three.js: root empty `Car_<Kind>`, one joined child mesh `Car_<Kind>_Mesh`,
plate anchors `Car_<Kind>_PlateAnchorF/R`, materials CarPaint / CarGlass / Trim / Tyre / Rim /
Headlight / Taillight (+ Chrome, Caliper).
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

TAU = math.pi * 2


def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*color, 1)
    return m


M = {
    "paint": bpy.data.materials["CarPaint"],
    "glass": bpy.data.materials["CarGlass"],
    "trim": bpy.data.materials["Trim"],
    "tyre": bpy.data.materials["Tyre"],
    "rim": bpy.data.materials["Rim"],
    "head": bpy.data.materials["Headlight"],
    "tail": bpy.data.materials["Taillight"],
    "chrome": mat("Chrome", (0.85, 0.86, 0.88), rough=0.08, metal=1.0),
    "caliper": mat("Caliper", (0.7, 0.06, 0.05), rough=0.4),
}
MAT_ORDER = list(M.keys())


def new_obj(name, bm, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    for key in MAT_ORDER:
        me.materials.append(M[key])
    return ob


def mi(key):
    return MAT_ORDER.index(key)


# ---------------------------------------------------------------------------
# lofting
# ---------------------------------------------------------------------------

def rounded_ring(zb, zt, wb, wt, rt, rb, seg=3):
    """Closed ring (list of (x, z)) of a rounded-rectangle section, symmetric in x.
    Order: bottom-left → up left side → over the top → down right side."""
    rt = max(0.005, min(rt, (zt - zb) * 0.45, wt * 0.9))
    rb = max(0.005, min(rb, (zt - zb) * 0.3))
    pts = []
    # left bottom corner (arc from bottom to side)
    for i in range(seg + 1):
        a = math.pi * 1.5 - (math.pi / 2) * (i / seg)  # 270 -> 180 deg
        pts.append((-wb + rb + rb * math.cos(a), zb + rb + rb * math.sin(a)))
    # left side mid
    pts.append((-(wb + (wt - wb) * 0.5), zb + (zt - zb) * 0.5))
    # left top corner (180 -> 90)
    for i in range(seg + 1):
        a = math.pi - (math.pi / 2) * (i / seg)
        pts.append((-wt + rt + rt * math.cos(a), zt - rt + rt * math.sin(a)))
    # top middle
    pts.append((0.0, zt))
    # mirror the left half (excluding the top middle) to the right, reversed
    left = pts[:-1]
    right = [(-x, z) for (x, z) in reversed(left)]
    return pts + right


def loft(name, sections, ring_fn, coll, cap=True, face_mat=None):
    """sections: list of (y, params...). ring_fn(params) -> list of (x, z).
    face_mat(i_section, k_edge, n_edges) -> material key for the quad between section i and i+1 on ring edge k."""
    bm = bmesh.new()
    rings = []
    for sec in sections:
        y = sec[0]
        ring = ring_fn(*sec[1:])
        rings.append([bm.verts.new((x, y, z)) for (x, z) in ring])
    n = len(rings[0])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(n):
            k2 = (k + 1) % n
            f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            f.material_index = mi(face_mat(i, k, n) if face_mat else "paint")
    if cap:
        f0 = bm.faces.new(list(reversed(rings[0])))
        f1 = bm.faces.new(rings[-1])
        for f in (f0, f1):
            f.material_index = mi("paint")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_obj(name, bm, coll), bm


def apply_mods(ob):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def smooth(ob, angle=40):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


# ---------------------------------------------------------------------------
# simple primitives
# ---------------------------------------------------------------------------

def box(name, size, loc, key, coll, bevel=0.0, rot=(0, 0, 0), seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=seg, affect="EDGES", profile=0.5)
    for f in bm.faces:
        f.material_index = mi(key)
    ob = new_obj(name, bm, coll)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def lathe(name, profile, key, coll, steps=32):
    """Revolve a profile of (x_axial, radius) points around the X axis."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0.0, r)) for (x, r) in profile]
    edges = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + edges, cent=(0, 0, 0), axis=(1, 0, 0), angle=TAU, steps=steps, use_merge=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.material_index = mi(key)
    return new_obj(name, bm, coll)


def cylinder(name, r, depth, loc, key, coll, verts=32, axis="X"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r, depth=depth)
    for f in bm.faces:
        f.material_index = mi(key)
    ob = new_obj(name, bm, coll)
    ob.location = loc
    if axis == "X":
        ob.rotation_euler = (0, math.pi / 2, 0)
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


# ---------------------------------------------------------------------------
# wheel
# ---------------------------------------------------------------------------

def wheel(prefix, R, width, coll):
    """Wheel centred at the origin, outer face toward +X."""
    s = R / 0.33
    w = width / 0.23
    parts = []
    tyre = [(-0.10, 0.222), (-0.115, 0.27), (-0.105, 0.312), (-0.07, 0.329),
            (0.07, 0.329), (0.105, 0.312), (0.115, 0.27), (0.10, 0.222)]
    parts.append(lathe(prefix + "_Tyre", [(x * w, r * s) for x, r in tyre], "tyre", coll, steps=28))
    # rim barrel + lip
    barrel = [(-0.095, 0.214), (0.075, 0.214), (0.09, 0.222), (0.1, 0.214), (0.095, 0.2)]
    parts.append(lathe(prefix + "_Barrel", [(x * w, r * s) for x, r in barrel], "rim", coll, steps=28))
    # dark wheel well inside the rim so the spokes read
    parts.append(cylinder(prefix + "_Inner", 0.2 * s, 0.01, (0.02 * w, 0, 0), "trim", coll, verts=24))
    # brake disc and caliper behind the spokes
    parts.append(cylinder(prefix + "_Disc", 0.15 * s, 0.022, (0.045 * w, 0, 0), "rim", coll, verts=24))
    cal = box(prefix + "_Caliper", (0.05, 0.09 * s, 0.07 * s), (0.055 * w, -0.06 * s, 0.1 * s), "caliper", coll, bevel=0.01)
    parts.append(cal)
    # dished face: hub + 5 spokes
    hub = [(0.06, 0.0), (0.085, 0.0), (0.09, 0.03), (0.085, 0.05), (0.07, 0.058)]
    parts.append(lathe(prefix + "_Hub", [(x * w, r * s) for x, r in hub], "rim", coll, steps=24))
    parts.append(cylinder(prefix + "_Cap", 0.022 * s, 0.012, (0.092 * w, 0, 0), "chrome", coll, verts=16))
    for k in range(5):
        a = k * TAU / 5
        sp = box(prefix + f"_Spoke{k}", (0.03, 0.032 * s, 0.16 * s), (0, 0, 0), "rim", coll, bevel=0.008)
        # spoke runs radially from the hub to the barrel, dished outward at the hub
        sp.rotation_euler = (a, 0, 0)
        r_mid = 0.13 * s
        sp.location = (0.078 * w, -math.sin(a) * r_mid, math.cos(a) * r_mid)
        parts.append(sp)
    for p in parts:
        apply_transform(p)
    ob = join(parts, prefix)
    smooth(ob, 35)
    return ob


def apply_transform(ob):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


# ---------------------------------------------------------------------------
# car
# ---------------------------------------------------------------------------

def build_car(kind, spec, coll, root_loc):
    name = f"Car_{kind}"
    old = bpy.data.objects.get(name)
    if old:
        for c in list(old.children_recursive):
            bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.objects.remove(old, do_unlink=True)

    parts = []
    W = spec["half_w"]

    # ---- lower body: lofted rounded sections, subdivided, wheel arches cut out
    def body_ring(zb, zt, w, rt):
        return rounded_ring(zb, zt, w, w * 0.965, rt, 0.07, seg=3)

    body, _ = loft(name + "_Body", spec["body"], body_ring, coll)
    sub = body.modifiers.new("sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    apply_mods(body)
    for (wy, _) in spec["axles"]:
        cut = cylinder(name + "_ArchCut", spec["wheel_r"] + 0.055, 2 * W + 0.4, (0, wy, spec["wheel_r"] + 0.02), "trim", coll, verts=40)
        bo = body.modifiers.new("arch", "BOOLEAN")
        bo.operation = "DIFFERENCE"
        bo.object = cut
        try:
            bo.solver = "EXACT"
        except TypeError:
            pass
        try:
            bo.material_mode = "TRANSFER"
        except (TypeError, AttributeError):
            pass
        apply_mods(body)
        bpy.data.objects.remove(cut, do_unlink=True)
    smooth(body, 50)
    parts.append(body)

    # ---- greenhouse: lofted cabin; window regions inset into recessed glass with a rubber frame
    def cab_ring(zb, zt, wb, wt, rt):
        rt = min(rt, (zt - zb) * 0.45)
        pts = [(-wb, zb), (-(wb + (wt - wb) * 0.12), zb + (zt - zb) * 0.12)]
        side_top = zt - rt
        pts.append((-(wb + (wt - wb) * 0.92), max(zb + (zt - zb) * 0.2, side_top)))
        for i in range(1, 3):
            a = math.pi - (math.pi / 2) * (i / 3)
            pts.append((-wt + rt + rt * math.cos(a), zt - rt + rt * math.sin(a)))
        top_w = wt - rt
        for t in (-1, -0.5, 0, 0.5, 1):
            pts.append((t * top_w, zt))
        right = [(-x, z) for (x, z) in reversed(pts[:5])]
        return pts + right  # 15 points

    cab_secs = spec["cabin"]
    ys = [s[0] for s in cab_secs]
    ws_end, roof_end, rear_start = spec["cabin_zones"]  # y where windshield ends, roof ends, rear glass starts
    bpillar = spec["b_pillar"]

    def cab_mat(i, k, n):
        y0, y1 = ys[i], ys[i + 1]
        ym = (y0 + y1) / 2
        # ring edges: 1->2 left side band, 12->13 right side band, 5..8 top
        if k in (1, 12):
            if spec["side_glass"][0] > ym > spec["side_glass"][1] and not (bpillar[0] > ym > bpillar[1]):
                return "glass"
        if 5 <= k <= 8:
            if ym > ws_end or ym < rear_start:
                return "glass"
        return "paint"

    cabin, _ = loft(name + "_Cabin", cab_secs, cab_ring, coll, face_mat=cab_mat)
    # inset every glass region: frame ring (trim) + recessed pane (glass)
    me = cabin.data
    bm = bmesh.new()
    bm.from_mesh(me)
    glass_idx = mi("glass")
    regions = []
    seen = set()
    for f in bm.faces:
        if f.material_index != glass_idx or f.index in seen:
            continue
        stack, reg = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            reg.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.material_index == glass_idx and h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        regions.append(reg)
    for reg in regions:
        before = set(bm.faces)
        res = bmesh.ops.inset_region(bm, faces=reg, thickness=spec.get("frame", 0.035), depth=-0.012, use_even_offset=True)
        for f in bm.faces:
            if f not in before:
                f.material_index = mi("trim")
        for f in reg:
            f.material_index = glass_idx
    bm.to_mesh(me)
    bm.free()
    smooth(cabin, 30)
    parts.append(cabin)

    # roof rails (SUV)
    if spec.get("rails"):
        y0, y1, z = spec["rails"]
        for sx in (-1, 1):
            parts.append(box(name + f"_Rail{sx}", (0.045, abs(y0 - y1), 0.04), (sx * (spec["roof_w"] - 0.08), (y0 + y1) / 2, z), "chrome", coll, bevel=0.012))
            for fy in (y0 - 0.05, (y0 + y1) / 2, y1 + 0.05):
                parts.append(box(name + f"_RailFoot{sx}{fy:.2f}", (0.06, 0.08, 0.06), (sx * (spec["roof_w"] - 0.08), fy, z - 0.035), "trim", coll, bevel=0.01))

    # ---- lights, grille, bumpers, trim
    f = spec["front"]
    r = spec["rear"]
    for sx in (-1, 1):
        parts.append(box(name + f"_Head{sx}", (0.36, 0.12, 0.11), (sx * f["head_x"], f["head_y"], f["head_z"]), "head", coll,
                         bevel=0.035, rot=(math.radians(-14), 0, sx * math.radians(-8))))
        parts.append(box(name + f"_HeadChrome{sx}", (0.37, 0.1, 0.02), (sx * f["head_x"], f["head_y"] - 0.01, f["head_z"] - 0.065), "chrome", coll,
                         bevel=0.008, rot=(math.radians(-14), 0, sx * math.radians(-8))))
        parts.append(box(name + f"_Tail{sx}", (0.38, 0.1, 0.12), (sx * r["tail_x"], r["tail_y"], r["tail_z"]), "tail", coll,
                         bevel=0.03, rot=(0, 0, sx * math.radians(6))))
        parts.append(box(name + f"_Fog{sx}", (0.14, 0.05, 0.05), (sx * f["fog_x"], f["bumper_y"] + 0.02, f["fog_z"]), "head", coll, bevel=0.015))
        # mirror: stalk + housing
        mx, my, mz = spec["mirror"]
        parts.append(box(name + f"_MirrorStalk{sx}", (0.08, 0.05, 0.04), (sx * (mx - 0.06), my, mz - 0.02), "trim", coll, bevel=0.01))
        parts.append(box(name + f"_Mirror{sx}", (0.1, 0.16, 0.11), (sx * mx, my, mz), "paint", coll, bevel=0.035))
        # door handles
        for hy in spec["handles"]:
            parts.append(box(name + f"_Handle{sx}{hy}", (0.02, 0.13, 0.025), (sx * (spec["handle_x"]), hy, spec["handle_z"]), "chrome", coll, bevel=0.008))
        # side skirt
        parts.append(box(name + f"_Skirt{sx}", (0.05, spec["skirt_len"], 0.07), (sx * (W - 0.01), spec["skirt_y"], spec["skirt_z"]), "trim", coll, bevel=0.02))
    # grille with chrome slats
    gw, gz, gh = f["grille"]
    parts.append(box(name + "_Grille", (gw, 0.06, gh), (0, f["bumper_y"] + 0.005, gz), "trim", coll, bevel=0.02))
    for i in range(3):
        parts.append(box(name + f"_Slat{i}", (gw * 0.92, 0.025, 0.012), (0, f["bumper_y"] + 0.035, gz - gh / 3 + i * gh / 3), "chrome", coll, bevel=0.004))
    # lower bumper lips
    parts.append(box(name + "_LipF", (2 * W * 0.86, 0.1, 0.07), (0, f["bumper_y"] - 0.03, f["lip_z"]), "trim", coll, bevel=0.025))
    parts.append(box(name + "_LipR", (2 * W * 0.86, 0.1, 0.08), (0, r["bumper_y"] + 0.03, r["lip_z"]), "trim", coll, bevel=0.025))
    # plates
    pf = spec["plate_f"]
    pr = spec["plate_r"]
    parts.append(box(name + "_PlateBackF", (0.56, 0.025, 0.15), (0, pf[0], pf[1]), "trim", coll, bevel=0.006))
    parts.append(box(name + "_PlateBackR", (0.56, 0.025, 0.15), (0, pr[0], pr[1]), "trim", coll, bevel=0.006))

    # ---- wheels
    R = spec["wheel_r"]
    for (wy, _) in spec["axles"]:
        for sx in (-1, 1):
            w = wheel(name + f"_Wheel{sx}_{wy:+.1f}", R, spec["wheel_w"], coll)
            if sx < 0:
                w.scale = (-1, 1, 1)
                apply_transform(w)
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.mesh.normals_make_consistent(inside=False)
                bpy.ops.object.mode_set(mode="OBJECT")
            w.location = (sx * (W - spec["wheel_inset"]), wy, R)
            apply_transform(w)
            parts.append(w)

    for p in parts:
        apply_transform(p)
    mesh = join(parts, name + "_Mesh")

    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    root.location = root_loc
    mesh.parent = root
    mesh.location = (0, 0, 0)
    for tag, (py, pz), sign in (("F", pf, 1), ("R", pr, -1)):
        a = bpy.data.objects.new(f"{name}_PlateAnchor{tag}", None)
        a.empty_display_size = 0.2
        coll.objects.link(a)
        a.parent = root
        a.location = (0, py + sign * 0.016, pz)
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    return root, tris


SEDAN = {
    "half_w": 0.91,
    "wheel_r": 0.33,
    "wheel_w": 0.22,
    "wheel_inset": 0.13,
    "axles": [(1.38, 0), (-1.36, 0)],
    # (y, z_bottom, z_top, half_width, top_radius)
    "body": [
        (2.36, 0.33, 0.56, 0.70, 0.10),
        (2.30, 0.24, 0.65, 0.84, 0.14),
        (2.10, 0.20, 0.77, 0.89, 0.18),
        (1.70, 0.19, 0.85, 0.91, 0.2),
        (1.10, 0.19, 0.91, 0.915, 0.2),
        (0.40, 0.19, 0.94, 0.915, 0.19),
        (-0.40, 0.19, 0.95, 0.915, 0.19),
        (-1.20, 0.19, 0.96, 0.915, 0.19),
        (-1.75, 0.20, 0.97, 0.905, 0.19),
        (-2.10, 0.22, 0.94, 0.88, 0.18),
        (-2.30, 0.27, 0.84, 0.83, 0.15),
        (-2.38, 0.33, 0.62, 0.74, 0.1),
    ],
    # (y, z_bottom, z_top, half_w_bottom, half_w_top, top_radius)
    "cabin": [
        (1.10, 0.88, 0.92, 0.86, 0.85, 0.02),
        (0.95, 0.89, 1.00, 0.86, 0.80, 0.06),
        (0.70, 0.90, 1.13, 0.86, 0.76, 0.1),
        (0.42, 0.91, 1.27, 0.86, 0.72, 0.13),
        (0.15, 0.92, 1.38, 0.86, 0.69, 0.15),
        (-0.05, 0.92, 1.42, 0.86, 0.68, 0.16),
        (-0.36, 0.93, 1.43, 0.86, 0.68, 0.16),
        (-0.50, 0.93, 1.43, 0.86, 0.68, 0.16),
        (-0.85, 0.93, 1.42, 0.86, 0.68, 0.16),
        (-1.08, 0.94, 1.39, 0.86, 0.69, 0.15),
        (-1.35, 0.94, 1.27, 0.86, 0.72, 0.13),
        (-1.62, 0.95, 1.12, 0.86, 0.76, 0.1),
        (-1.85, 0.95, 0.99, 0.86, 0.8, 0.05),
    ],
    "cabin_zones": (0.10, -1.0, -1.05),
    "side_glass": (0.88, -1.5),
    "b_pillar": (-0.33, -0.52),
    "frame": 0.032,
    "mirror": (0.98, 0.78, 1.0),
    "handles": [0.25, -0.75],
    "handle_x": 0.905,
    "handle_z": 0.84,
    "skirt_len": 2.2,
    "skirt_y": 0.0,
    "skirt_z": 0.27,
    "front": {"head_x": 0.6, "head_y": 2.2, "head_z": 0.66, "bumper_y": 2.33, "grille": (0.72, 0.5, 0.16),
              "lip_z": 0.27, "fog_x": 0.62, "fog_z": 0.38},
    "rear": {"tail_x": 0.64, "tail_y": -2.27, "tail_z": 0.8, "bumper_y": -2.35, "lip_z": 0.3},
    "plate_f": (2.37, 0.44),
    "plate_r": (-2.39, 0.53),
}

SUV = {
    "half_w": 0.95,
    "wheel_r": 0.37,
    "wheel_w": 0.24,
    "wheel_inset": 0.13,
    "axles": [(1.42, 0), (-1.38, 0)],
    "body": [
        (2.38, 0.40, 0.70, 0.74, 0.1),
        (2.32, 0.30, 0.86, 0.88, 0.14),
        (2.12, 0.27, 0.98, 0.93, 0.18),
        (1.70, 0.27, 1.03, 0.95, 0.2),
        (1.10, 0.27, 1.08, 0.955, 0.2),
        (0.30, 0.27, 1.11, 0.955, 0.19),
        (-0.60, 0.27, 1.12, 0.955, 0.19),
        (-1.50, 0.27, 1.12, 0.955, 0.19),
        (-2.05, 0.29, 1.11, 0.94, 0.18),
        (-2.30, 0.33, 1.04, 0.9, 0.15),
        (-2.40, 0.40, 0.84, 0.82, 0.1),
    ],
    "cabin": [
        (1.25, 1.04, 1.08, 0.9, 0.89, 0.02),
        (1.08, 1.05, 1.18, 0.9, 0.85, 0.06),
        (0.85, 1.06, 1.33, 0.9, 0.82, 0.1),
        (0.58, 1.07, 1.50, 0.9, 0.8, 0.13),
        (0.35, 1.08, 1.62, 0.9, 0.79, 0.15),
        (0.10, 1.08, 1.68, 0.9, 0.79, 0.16),
        (-0.30, 1.09, 1.69, 0.9, 0.79, 0.16),
        (-0.46, 1.09, 1.69, 0.9, 0.79, 0.16),
        (-1.10, 1.09, 1.69, 0.9, 0.79, 0.16),
        (-1.65, 1.09, 1.68, 0.9, 0.79, 0.15),
        (-1.95, 1.09, 1.64, 0.9, 0.8, 0.13),
        (-2.12, 1.09, 1.50, 0.9, 0.82, 0.1),
        (-2.22, 1.09, 1.20, 0.9, 0.86, 0.05),
    ],
    "cabin_zones": (0.30, -1.9, -1.97),
    "side_glass": (1.0, -1.85),
    "b_pillar": (-0.28, -0.48),
    "frame": 0.036,
    "rails": (0.45, -1.8, 1.72),
    "roof_w": 0.79,
    "mirror": (1.02, 0.95, 1.18),
    "handles": [0.2, -0.85],
    "handle_x": 0.945,
    "handle_z": 1.0,
    "skirt_len": 2.15,
    "skirt_y": 0.0,
    "skirt_z": 0.36,
    "front": {"head_x": 0.63, "head_y": 2.22, "head_z": 0.88, "bumper_y": 2.35, "grille": (0.8, 0.66, 0.22),
              "lip_z": 0.34, "fog_x": 0.66, "fog_z": 0.48},
    "rear": {"tail_x": 0.68, "tail_y": -2.33, "tail_z": 0.98, "bumper_y": -2.4, "lip_z": 0.37},
    "plate_f": (2.39, 0.52),
    "plate_r": (-2.42, 0.66),
}
