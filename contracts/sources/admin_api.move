module one_portrait::admin_api;

use one_portrait::master_portrait::{Self as master_portrait, PlacementInput};
use one_portrait::registry::{AdminCap, Registry};
use one_portrait::unit::{Self as unit, Unit};

const EPLACEMENT_VECTOR_LENGTH_MISMATCH: u64 = 1;

public fun create_unit(
    admin_cap: &AdminCap,
    registry: &mut Registry,
    display_name: vector<u8>,
    thumbnail_url: vector<u8>,
    target_walrus_blob: vector<u8>,
    max_slots: u64,
    display_max_slots: u64,
    ctx: &mut TxContext,
): ID {
    unit::create_unit(
        admin_cap,
        registry,
        display_name,
        thumbnail_url,
        target_walrus_blob,
        max_slots,
        display_max_slots,
        ctx,
    )
}

public fun finalize(
    admin_cap: &AdminCap,
    unit: &mut Unit,
    mosaic_blob_id: vector<u8>,
    placements: vector<PlacementInput>,
    ctx: &mut TxContext,
) {
    unit::finalize(admin_cap, unit, mosaic_blob_id, placements, ctx);
}

public fun finalize_with_primitive_placements(
    admin_cap: &AdminCap,
    unit: &mut Unit,
    mosaic_blob_id: vector<u8>,
    mut blob_ids: vector<vector<u8>>,
    mut xs: vector<u16>,
    mut ys: vector<u16>,
    mut submitters: vector<address>,
    mut submission_nos: vector<u64>,
    ctx: &mut TxContext,
) {
    let placement_count = vector::length(&blob_ids);
    assert!(
        vector::length(&xs) == placement_count
            && vector::length(&ys) == placement_count
            && vector::length(&submitters) == placement_count
            && vector::length(&submission_nos) == placement_count,
        EPLACEMENT_VECTOR_LENGTH_MISMATCH,
    );

    let mut placements = vector[];
    while (!vector::is_empty(&blob_ids)) {
        vector::push_back(
            &mut placements,
            master_portrait::new_placement_input(
                vector::pop_back(&mut blob_ids),
                vector::pop_back(&mut xs),
                vector::pop_back(&mut ys),
                vector::pop_back(&mut submitters),
                vector::pop_back(&mut submission_nos),
            ),
        );
    };

    unit::finalize(admin_cap, unit, mosaic_blob_id, placements, ctx);
}

public fun finalize_empty(
    admin_cap: &AdminCap,
    unit: &mut Unit,
    mosaic_blob_id: vector<u8>,
    ctx: &mut TxContext,
) {
    unit::finalize(admin_cap, unit, mosaic_blob_id, vector[], ctx);
}
