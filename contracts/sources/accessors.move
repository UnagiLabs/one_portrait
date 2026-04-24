module one_portrait::accessors;

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
