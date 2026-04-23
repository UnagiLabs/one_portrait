module one_portrait::admin_api;

use one_portrait::master_portrait::PlacementInput;
use one_portrait::registry::{Self as registry, AdminCap, Registry};
use one_portrait::unit::{Self as unit, Unit};

public fun create_unit(
    admin_cap: &AdminCap,
    registry: &mut Registry,
    athlete_id: u16,
    target_walrus_blob: vector<u8>,
    max_slots: u64,
    ctx: &mut TxContext,
): ID {
    unit::create_unit(
        admin_cap,
        registry,
        athlete_id,
        target_walrus_blob,
        max_slots,
        ctx,
    )
}

public fun rotate_current_unit(
    admin_cap: &AdminCap,
    registry: &mut Registry,
    athlete_id: u16,
    next_unit: &Unit,
) {
    unit::rotate_current_unit(admin_cap, registry, athlete_id, next_unit);
}

public fun upsert_athlete_metadata(
    admin_cap: &AdminCap,
    registry: &mut Registry,
    athlete_id: u16,
    display_name: vector<u8>,
    slug: vector<u8>,
    thumbnail_url: vector<u8>,
) {
    registry::upsert_athlete_metadata(
        admin_cap,
        registry,
        athlete_id,
        display_name,
        slug,
        thumbnail_url,
    );
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
