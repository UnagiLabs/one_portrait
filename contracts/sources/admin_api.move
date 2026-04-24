module one_portrait::admin_api;

use one_portrait::master_portrait::PlacementInput;
use one_portrait::registry::{AdminCap, Registry};
use one_portrait::unit::{Self as unit, Unit};

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

public fun finalize_empty(
    admin_cap: &AdminCap,
    unit: &mut Unit,
    mosaic_blob_id: vector<u8>,
    ctx: &mut TxContext,
) {
    unit::finalize(admin_cap, unit, mosaic_blob_id, vector[], ctx);
}
