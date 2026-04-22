module one_portrait::accessors;

use one_portrait::registry::{Self as registry, Registry};
use one_portrait::unit::{Self as unit, Unit};
use sui::clock::Clock;

public fun submit_photo(
    unit: &mut Unit,
    walrus_blob_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    unit::submit_photo(unit, walrus_blob_id, clock, ctx);
}

public fun current_unit_id(registry_obj: &Registry, athlete_id: u16): Option<ID> {
    registry::current_unit_id(registry_obj, athlete_id)
}
