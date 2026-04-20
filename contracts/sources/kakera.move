#[allow(unused_field)]
module one_portrait::kakera;

public struct Kakera has key {
    id: UID,
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    minted_at_ms: u64,
}

public(package) fun mint_and_transfer(
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    minted_at_ms: u64,
    ctx: &mut TxContext,
) {
    transfer::transfer(
        Kakera {
            id: object::new(ctx),
            unit_id,
            athlete_id,
            submitter,
            walrus_blob_id,
            submission_no,
            minted_at_ms,
        },
        submitter,
    );
}

#[test_only]
public fun unit_id_for_testing(kakera: &Kakera): ID {
    kakera.unit_id
}

#[test_only]
public fun athlete_id_for_testing(kakera: &Kakera): u16 {
    kakera.athlete_id
}

#[test_only]
public fun submitter_for_testing(kakera: &Kakera): address {
    kakera.submitter
}

#[test_only]
public fun walrus_blob_id_for_testing(kakera: &Kakera): vector<u8> {
    copy kakera.walrus_blob_id
}

#[test_only]
public fun submission_no_for_testing(kakera: &Kakera): u64 {
    kakera.submission_no
}

#[test_only]
public fun minted_at_ms_for_testing(kakera: &Kakera): u64 {
    kakera.minted_at_ms
}
