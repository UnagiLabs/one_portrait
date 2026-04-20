#[allow(unused_field)]
module one_portrait::master_portrait;

use sui::table::{Self as table, Table};

public struct MasterPortrait has key, store {
    id: UID,
    unit_id: ID,
    athlete_id: u16,
    mosaic_walrus_blob_id: vector<u8>,
    placements: Table<vector<u8>, Placement>,
}

public struct Placement has copy, drop, store {
    x: u16,
    y: u16,
    submitter: address,
    submission_no: u64,
}

public struct PlacementInput has copy, drop, store {
    blob_id: vector<u8>,
    x: u16,
    y: u16,
    submitter: address,
    submission_no: u64,
}

public fun new_placement_input(
    blob_id: vector<u8>,
    x: u16,
    y: u16,
    submitter: address,
    submission_no: u64,
): PlacementInput {
    PlacementInput {
        blob_id,
        x,
        y,
        submitter,
        submission_no,
    }
}

public(package) fun create(
    unit_id: ID,
    athlete_id: u16,
    mosaic_walrus_blob_id: vector<u8>,
    mut placement_inputs: vector<PlacementInput>,
    ctx: &mut TxContext,
): MasterPortrait {
    let mut placements = table::new(ctx);
    while (!vector::is_empty(&placement_inputs)) {
        let PlacementInput {
            blob_id,
            x,
            y,
            submitter,
            submission_no,
        } = vector::pop_back(&mut placement_inputs);
        table::add(
            &mut placements,
            blob_id,
            Placement {
                x,
                y,
                submitter,
                submission_no,
            },
        );
    };

    MasterPortrait {
        id: object::new(ctx),
        unit_id,
        athlete_id,
        mosaic_walrus_blob_id,
        placements,
    }
}

public(package) fun create_and_transfer(
    unit_id: ID,
    athlete_id: u16,
    mosaic_walrus_blob_id: vector<u8>,
    placement_inputs: vector<PlacementInput>,
    recipient: address,
    ctx: &mut TxContext,
): ID {
    let master = create(
        unit_id,
        athlete_id,
        mosaic_walrus_blob_id,
        placement_inputs,
        ctx,
    );
    let master_id = object::id(&master);
    transfer::transfer(master, recipient);
    master_id
}

#[test_only]
public fun unit_id_for_testing(master: &MasterPortrait): ID {
    master.unit_id
}

#[test_only]
public fun athlete_id_for_testing(master: &MasterPortrait): u16 {
    master.athlete_id
}

#[test_only]
public fun mosaic_walrus_blob_id_for_testing(master: &MasterPortrait): vector<u8> {
    copy master.mosaic_walrus_blob_id
}

#[test_only]
public fun placement_for_testing(master: &MasterPortrait, blob_id: vector<u8>): Placement {
    *table::borrow(&master.placements, blob_id)
}

#[test_only]
public fun placement_x_for_testing(placement: &Placement): u16 {
    placement.x
}

#[test_only]
public fun placement_y_for_testing(placement: &Placement): u16 {
    placement.y
}

#[test_only]
public fun placement_submitter_for_testing(placement: &Placement): address {
    placement.submitter
}

#[test_only]
public fun placement_submission_no_for_testing(placement: &Placement): u64 {
    placement.submission_no
}
