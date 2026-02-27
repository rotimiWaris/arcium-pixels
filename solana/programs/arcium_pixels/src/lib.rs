use anchor_lang::prelude::*;

declare_id!("7U2tXnjHxXRB4txpGW9tB5n1CoPJqwRsn5Da63ddgVp4");
pub const ADMIN_AUTHORITY: Pubkey = pubkey!("FTGLYKah3ZXRNSMb1uji2DXiTTHt8isPYqLxnG6oNJrf");

#[program]
pub mod arcium_pixels {
    use super::*;

    pub fn initialize_board(ctx: Context<InitializeBoard>, total_pixels: u16) -> Result<()> {
        let board = &mut ctx.accounts.board;
        board.authority = ctx.accounts.authority.key();
        board.total_pixels = total_pixels;
        board.bump = ctx.bumps.board;
        Ok(())
    }

    pub fn claim_pixel(
        ctx: Context<ClaimPixel>,
        pixel_id: u16,
        price_lamports: u64,
        lease_expires_at: i64,
        metadata_uri: String,
    ) -> Result<()> {
        require!(
            pixel_id > 0 && pixel_id <= ctx.accounts.board.total_pixels,
            PixelError::InvalidPixelId
        );
        require!(
            metadata_uri.len() <= 256,
            PixelError::MetadataTooLong
        );

        let pixel = &mut ctx.accounts.pixel;
        require!(pixel.owner == Pubkey::default(), PixelError::AlreadyClaimed);

        pixel.board = ctx.accounts.board.key();
        pixel.pixel_id = pixel_id;
        pixel.owner = ctx.accounts.owner.key();
        pixel.price_lamports = price_lamports;
        pixel.lease_expires_at = lease_expires_at;
        pixel.metadata_uri = metadata_uri;
        pixel.claimed_at = Clock::get()?.unix_timestamp;
        pixel.bump = ctx.bumps.pixel;

        let owner_index = &mut ctx.accounts.owner_index;
        require!(
            owner_index.owner == Pubkey::default(),
            PixelError::AlreadyOwnsPixel
        );
        owner_index.owner = ctx.accounts.owner.key();
        owner_index.pixel_id = pixel_id;
        owner_index.bump = ctx.bumps.owner_index;

        Ok(())
    }

    pub fn set_pixel_license(
        ctx: Context<SetPixelLicense>,
        price_lamports: u64,
        lease_expires_at: i64,
        metadata_uri: String,
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= 256,
            PixelError::MetadataTooLong
        );
        let pixel = &mut ctx.accounts.pixel;
        require!(pixel.owner == ctx.accounts.owner.key(), PixelError::NotOwner);
        pixel.price_lamports = price_lamports;
        pixel.lease_expires_at = lease_expires_at;
        pixel.metadata_uri = metadata_uri;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeBoard<'info> {
    #[account(mut, address = ADMIN_AUTHORITY @ PixelError::UnauthorizedInitializer)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Board::INIT_SPACE,
        seeds = [b"board"],
        bump
    )]
    pub board: Account<'info, Board>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pixel_id: u16)]
pub struct ClaimPixel<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"board"], bump = board.bump)]
    pub board: Account<'info, Board>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Pixel::INIT_SPACE,
        seeds = [b"pixel".as_ref(), pixel_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pixel: Account<'info, Pixel>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + OwnerIndex::INIT_SPACE,
        seeds = [b"owner".as_ref(), owner.key().as_ref()],
        bump
    )]
    pub owner_index: Account<'info, OwnerIndex>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPixelLicense<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub pixel: Account<'info, Pixel>,
}

#[account]
#[derive(InitSpace)]
pub struct Board {
    pub authority: Pubkey,
    pub total_pixels: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pixel {
    pub board: Pubkey,
    pub pixel_id: u16,
    pub owner: Pubkey,
    pub price_lamports: u64,
    pub lease_expires_at: i64,
    #[max_len(256)]
    pub metadata_uri: String,
    pub claimed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OwnerIndex {
    pub owner: Pubkey,
    pub pixel_id: u16,
    pub bump: u8,
}

#[error_code]
pub enum PixelError {
    #[msg("Invalid pixel id")]
    InvalidPixelId,
    #[msg("Pixel already claimed")]
    AlreadyClaimed,
    #[msg("Wallet already owns a pixel")]
    AlreadyOwnsPixel,
    #[msg("Only owner can update pixel license")]
    NotOwner,
    #[msg("Metadata URI too long")]
    MetadataTooLong,
    #[msg("Only admin can initialize board")]
    UnauthorizedInitializer,
}

